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
      fs.renameSync(tmp, filePath);
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
}
