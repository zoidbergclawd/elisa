/** Encapsulates all session state into a single store. Replaces 4 parallel Maps. */

import type { BuildSession } from '../models/session.js';
import type { Orchestrator } from './orchestrator.js';
import type { SkillRunner } from './skillRunner.js';

export interface SessionEntry {
  session: BuildSession;
  orchestrator: Orchestrator | null;
  skillRunner: SkillRunner | null;
  cancelFn: (() => void) | null;
  createdAt: number;
}

export class SessionStore {
  private entries = new Map<string, SessionEntry>();
  private cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

  create(id: string, session: BuildSession): SessionEntry {
    const entry: SessionEntry = {
      session,
      orchestrator: null,
      skillRunner: null,
      cancelFn: null,
      createdAt: Date.now(),
    };
    this.entries.set(id, entry);
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

  /** Schedule cleanup of a session after a grace period. */
  scheduleCleanup(id: string, delayMs = 300_000): void {
    // Clear any existing timer
    const existing = this.cleanupTimers.get(id);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      const entry = this.entries.get(id);
      if (entry?.orchestrator) {
        entry.orchestrator.cleanup();
      }
      this.entries.delete(id);
      this.cleanupTimers.delete(id);
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
          entry.orchestrator.cleanup(0);
        }
        this.entries.delete(id);
        const timer = this.cleanupTimers.get(id);
        if (timer) {
          clearTimeout(timer);
          this.cleanupTimers.delete(id);
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
