/** Encapsulates all session state into a single store. Replaces 4 parallel Maps. */

import type { BuildSession } from '../models/session.js';
import type { Orchestrator } from './orchestrator.js';
import type { SkillRunner } from './skillRunner.js';
import { SessionPersistence } from '../utils/sessionPersistence.js';

export interface SessionEntry {
  session: BuildSession;
  orchestrator: Orchestrator | null;
  skillRunner: SkillRunner | null;
  cancelFn: (() => void) | null;
  createdAt: number;
  /** True when user chose a workspace directory (skip auto-cleanup of files). */
  userWorkspace: boolean;
}

export class SessionStore {
  private entries = new Map<string, SessionEntry>();
  private cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private persistence: SessionPersistence | null;

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
          createdAt: p.savedAt,
          userWorkspace: false,
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

  /** Schedule cleanup of a session after a grace period. */
  scheduleCleanup(id: string, delayMs = 300_000): void {
    // Clear any existing timer
    const existing = this.cleanupTimers.get(id);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      const entry = this.entries.get(id);
      if (entry?.orchestrator && !entry.userWorkspace) {
        entry.orchestrator.cleanup();
      }
      this.entries.delete(id);
      this.cleanupTimers.delete(id);
      if (this.persistence) {
        try { this.persistence.remove(id); } catch { /* ignore */ }
      }
    }, delayMs);

    this.cleanupTimers.set(id, timer);
  }

  /** Remove stale sessions older than maxAge (default 1 hour). */
  pruneStale(maxAgeMs = 3_600_000): string[] {
    const now = Date.now();
    const pruned: string[] = [];
    for (const [id, entry] of this.entries) {
      if (now - entry.createdAt > maxAgeMs) {
        if (entry.orchestrator) {
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

  get size(): number {
    return this.entries.size;
  }

  /** Iterate all entries for operations like shutdown. */
  [Symbol.iterator](): IterableIterator<[string, SessionEntry]> {
    return this.entries[Symbol.iterator]();
  }
}
