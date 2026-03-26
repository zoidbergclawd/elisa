/** Encapsulates all session state into a single store. Replaces 4 parallel Maps. */

import fs from 'node:fs';
import path from 'node:path';
import type { BuildSession } from '../models/session.js';
import type { Orchestrator } from './orchestrator.js';
import type { SkillRunner } from './skillRunner.js';
import type { IterativeChatSession } from './iterativeChatService.js';
import { SessionPersistence } from '../utils/sessionPersistence.js';
import { getProjectsDir } from './projectIndex.js';
import { CLEANUP_DELAY_MS, SESSION_MAX_AGE_MS } from '../utils/constants.js';

export interface SessionEntry {
  session: BuildSession;
  orchestrator: Orchestrator | null;
  skillRunner: SkillRunner | null;
  cancelFn: (() => void) | null;
  createdAt: number;
  /** True when user chose a workspace directory (skip auto-cleanup of files). */
  userWorkspace: boolean;
  /** Process spawned by the launch endpoint (standalone serve without rebuild). */
  launchProcess: import('node:child_process').ChildProcess | null;
  /** Built-in static server for web preview (replaces npx serve). */
  staticServer: import('../utils/staticServer.js').StaticServer | null;
  /** Iterative chat session for post-build conversation. */
  iterativeChat?: IterativeChatSession;
}

export class SessionStore {
  private entries = new Map<string, SessionEntry>();
  private cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private persistence: SessionPersistence | null;
  /** Optional callback invoked when a session is removed (for external resource cleanup). */
  onCleanup: ((sessionId: string) => void) | null = null;
  /** Optional callback to check if a session has active WS connections (set by server.ts). */
  isConnected: ((sessionId: string) => boolean) | null = null;

  constructor(persistenceDir?: string | false) {
    this.persistence = persistenceDir === false
      ? null
      : new SessionPersistence(persistenceDir || undefined);
  }

  create(id: string, session: BuildSession): SessionEntry {
    const entry: SessionEntry = {
      session,
      orchestrator: null,
      skillRunner: null,
      cancelFn: null,
      createdAt: Date.now(),
      userWorkspace: false,
      launchProcess: null,
      staticServer: null,
    };
    this.entries.set(id, entry);
    this.checkpoint(id);
    return entry;
  }

  get(id: string): SessionEntry | undefined {
    return this.entries.get(id);
  }

  getOrThrow(id: string): SessionEntry {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Session not found: ${id}`);
    return entry;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  /** Persist current session state to disk. Called at phase transitions. */
  checkpoint(id: string): void {
    if (!this.persistence) return;
    const entry = this.entries.get(id);
    if (!entry) return;
    try {
      this.persistence.checkpoint(entry.session);
    } catch {
      // Best-effort: don't crash if persistence fails
    }
  }

  /** Recover persisted sessions on startup. Returns recovered session count. */
  recover(): number {
    if (!this.persistence) return 0;
    let count = 0;
    try {
      const persisted = this.persistence.loadAll();
      for (const p of persisted) {
        if (this.entries.has(p.session.id)) continue;
        const entry: SessionEntry = {
          session: p.session,
          orchestrator: null,
          skillRunner: null,
          cancelFn: null,
          createdAt: new Date(p.savedAt).getTime(),
          userWorkspace: false,
          launchProcess: null,
          staticServer: null,
        };
        // Mark recovered sessions as done since orchestrators can't be restored
        if (entry.session.state !== 'idle' && entry.session.state !== 'done') {
          entry.session.state = 'done';
        }
        this.entries.set(p.session.id, entry);
        count++;
      }
    } catch {
      // Best-effort recovery
    }
    return count;
  }

  /** Cancel a pending cleanup timer without deleting the session. */
  cancelCleanup(id: string): void {
    const timer = this.cleanupTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.cleanupTimers.delete(id);
    }
  }

  /** Schedule cleanup of a session after a grace period. */
  scheduleCleanup(id: string, delayMs = CLEANUP_DELAY_MS): void {
    // Clear any existing timer
    const existing = this.cleanupTimers.get(id);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      const entry = this.entries.get(id);
      if (entry?.launchProcess) {
        try { entry.launchProcess.kill(); } catch { /* ignore */ }
        entry.launchProcess = null;
      }
      if (entry?.staticServer) {
        entry.staticServer.close();
        entry.staticServer = null;
      }
      if (entry?.orchestrator && !entry.userWorkspace) {
        entry.orchestrator.cleanup();
      }
      this.entries.delete(id);
      this.cleanupTimers.delete(id);
      if (this.persistence) {
        try { this.persistence.remove(id); } catch { /* ignore */ }
      }
      if (this.onCleanup) {
        try { this.onCleanup(id); } catch { /* ignore */ }
      }
    }, delayMs);

    this.cleanupTimers.set(id, timer);
  }

  /** Remove stale sessions older than maxAge (default 1 hour).
   *  Skips sessions that still have active WebSocket connections. */
  pruneStale(maxAgeMs = SESSION_MAX_AGE_MS): string[] {
    const now = Date.now();
    const pruned: string[] = [];
    for (const [id, entry] of this.entries) {
      if (now - entry.createdAt > maxAgeMs) {
        // Don't prune sessions with active WS connections
        if (this.isConnected?.(id)) continue;
        // Don't delete workspace files for persistent project directories
        const nuggetDir = entry.orchestrator?.nuggetDir;
        if (entry.orchestrator && !(nuggetDir && this.isProjectDir(nuggetDir))) {
          entry.orchestrator.cleanup();
        }
        this.entries.delete(id);
        const timer = this.cleanupTimers.get(id);
        if (timer) {
          clearTimeout(timer);
          this.cleanupTimers.delete(id);
        }
        if (this.persistence) {
          try { this.persistence.remove(id); } catch { /* ignore */ }
        }
        if (this.onCleanup) {
          try { this.onCleanup(id); } catch { /* ignore */ }
        }
        pruned.push(id);
      }
    }
    return pruned;
  }

  /** Cancel all running orchestrators. Used during shutdown. */
  cancelAll(): void {
    for (const [_id, entry] of this.entries) {
      if (entry.cancelFn) {
        entry.cancelFn();
        entry.cancelFn = null;
      }
    }
  }

  /** Checkpoint all sessions to disk. Used during graceful shutdown. */
  checkpointAll(): void {
    for (const [id] of this.entries) {
      this.checkpoint(id);
    }
  }

  /** Restore a session from a project directory's .elisa/session.json. */
  restoreFromProject(projectDir: string): SessionEntry | null {
    const sessionFile = path.join(projectDir, '.elisa', 'session.json');
    try {
      if (!fs.existsSync(sessionFile)) return null;
      const raw = fs.readFileSync(sessionFile, 'utf-8');
      const data = JSON.parse(raw);

      const session: BuildSession = data.session ?? {
        id: data.sessionId ?? '',
        state: data.state ?? 'done',
        spec: data.spec ?? null,
        tasks: data.tasks ?? [],
        agents: data.agents ?? [],
      };

      if (!session.id) return null;
      if (this.entries.has(session.id)) return this.entries.get(session.id)!;

      // Mark restored sessions as done (orchestrators can't be restored)
      if (session.state !== 'idle' && session.state !== 'done') {
        session.state = 'done';
      }

      const entry: SessionEntry = {
        session,
        orchestrator: null,
        skillRunner: null,
        cancelFn: null,
        createdAt: data.savedAt ? new Date(data.savedAt).getTime() : Date.now(),
        userWorkspace: true,
        launchProcess: null,
        staticServer: null,
      };
      this.entries.set(session.id, entry);
      return entry;
    } catch {
      return null;
    }
  }

  /** Returns true if the directory is under the persistent projects folder. */
  private isProjectDir(dir: string): boolean {
    try {
      const projectsRoot = getProjectsDir();
      const normalized = path.resolve(dir);
      const normalizedRoot = path.resolve(projectsRoot);
      return normalized.startsWith(normalizedRoot + path.sep) || normalized === normalizedRoot;
    } catch {
      return false;
    }
  }

  get size(): number {
    return this.entries.size;
  }

  /** Iterate all entries for operations like shutdown. */
  [Symbol.iterator](): IterableIterator<[string, SessionEntry]> {
    return this.entries[Symbol.iterator]();
  }
}
