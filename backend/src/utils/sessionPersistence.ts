/** Persists session state to disk for crash recovery. */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { BuildSession } from '../models/session.js';

export interface PersistedSession {
  session: BuildSession;
  savedAt: string;
  phase: string;
}

/** Comprehensive session metadata written to {nuggetDir}/.elisa/session.json for project persistence. */
export interface PersistedSessionMetadata {
  sessionId: string;
  savedAt: string;
  state: string;
  spec: any;
  tasks: any[];
  agents: any[];
  testResults: { passed: number; total: number } | null;
  individualTestResults: Array<{ test_name: string; passed: boolean; details: string }>;
  testGatePassed: boolean | null;
  deployUrl?: string;
  framework?: string;
  tokenUsage: { input: number; output: number; total: number } | null;
  chatHistory: any[];
}

const DEFAULT_DIR = path.join(os.tmpdir(), '.elisa-sessions');

export class SessionPersistence {
  private dir: string;

  constructor(dir?: string) {
    this.dir = dir ?? DEFAULT_DIR;
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
  }

  private filePath(sessionId: string): string {
    // Sanitize session ID to prevent path traversal
    const safe = sessionId.replace(/[^a-zA-Z0-9\-]/g, '_');
    return path.join(this.dir, `${safe}.json`);
  }

  /** Save session state to disk. */
  checkpoint(session: BuildSession): void {
    try {
      this.ensureDir();
      const data: PersistedSession = {
        session,
        savedAt: new Date().toISOString(),
        phase: session.state,
      };
      const filePath = this.filePath(session.id);
      const tmp = filePath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
      // On Windows, renameSync throws EPERM if destination exists.
      // Use copy+unlink as a cross-platform atomic write.
      fs.copyFileSync(tmp, filePath);
      fs.unlinkSync(tmp);
    } catch (err) {
      // Best-effort persistence -- don't crash the pipeline
      console.warn('Session checkpoint failed:', (err as Error).message);
    }
  }

  /** Load a single persisted session. */
  load(sessionId: string): PersistedSession | null {
    try {
      const filePath = this.filePath(sessionId);
      if (!fs.existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw) as PersistedSession;
    } catch {
      return null;
    }
  }

  /** Load all persisted sessions from disk. */
  loadAll(): PersistedSession[] {
    try {
      this.ensureDir();
      const files = fs.readdirSync(this.dir).filter((f) => f.endsWith('.json'));
      const sessions: PersistedSession[] = [];
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(this.dir, file), 'utf-8');
          sessions.push(JSON.parse(raw) as PersistedSession);
        } catch {
          // Skip corrupt files
        }
      }
      return sessions;
    } catch {
      return [];
    }
  }

  /** Remove persisted session file. */
  remove(sessionId: string): void {
    try {
      const filePath = this.filePath(sessionId);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Best-effort cleanup
    }
  }

  /** Remove all persisted session files. */
  clear(): void {
    try {
      if (!fs.existsSync(this.dir)) return;
      const files = fs.readdirSync(this.dir).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(this.dir, file));
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }

  /**
   * Write comprehensive session metadata to the workspace's .elisa/session.json.
   * This is the project-level persistence file read by listProjects() and restoreFromProject().
   */
  static checkpointToWorkspace(nuggetDir: string, session: BuildSession, extra?: {
    deployUrl?: string;
    framework?: string;
    tokenUsage?: { input: number; output: number; total: number };
  }): void {
    try {
      const elisaDir = path.join(nuggetDir, '.elisa');
      if (!fs.existsSync(elisaDir)) {
        fs.mkdirSync(elisaDir, { recursive: true });
      }

      const metadata: PersistedSessionMetadata = {
        sessionId: session.id,
        savedAt: new Date().toISOString(),
        state: session.state,
        spec: session.spec ?? null,
        tasks: session.tasks ?? [],
        agents: session.agents ?? [],
        testResults: session.testResults ?? null,
        individualTestResults: session.individualTestResults ?? [],
        testGatePassed: session.testGatePassed ?? null,
        deployUrl: extra?.deployUrl,
        framework: extra?.framework ?? (session.spec as any)?.framework,
        tokenUsage: extra?.tokenUsage ?? null,
        chatHistory: [],
      };

      const filePath = path.join(elisaDir, 'session.json');
      const tmp = filePath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(metadata, null, 2));
      // Cross-platform atomic write (Windows compat)
      fs.copyFileSync(tmp, filePath);
      fs.unlinkSync(tmp);
    } catch (err) {
      console.warn('Workspace checkpoint failed:', (err as Error).message);
    }
  }
}
