/** Health history service: persists health summaries across builds for trend tracking. */

import fs from 'node:fs';
import path from 'node:path';
import type { HealthGrade, HealthSummary } from './healthTracker.js';
import type { SendEvent } from './phases/types.js';

export interface HealthHistoryEntry {
  timestamp: string;
  goal: string;
  score: number;
  grade: HealthGrade;
  breakdown: {
    tasks: number;
    tests: number;
    corrections: number;
    budget: number;
  };
}

const MAX_HISTORY_ENTRIES = 20;
const HISTORY_FILENAME = 'health-history.json';

export class HealthHistoryService {
  private entries: HealthHistoryEntry[] = [];
  private filePath: string;

  constructor(nuggetDir: string) {
    this.filePath = path.join(nuggetDir, '.elisa', HISTORY_FILENAME);
  }

  /** Load history from disk. No-op if file doesn't exist. */
  load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.entries = parsed.slice(-MAX_HISTORY_ENTRIES);
        }
      }
    } catch {
      // Corrupted file or read error -- start fresh
      this.entries = [];
    }
  }

  /** Save a new health entry from the current build summary. */
  record(goal: string, summary: HealthSummary): void {
    const entry: HealthHistoryEntry = {
      timestamp: new Date().toISOString(),
      goal,
      score: summary.health_score,
      grade: summary.grade,
      breakdown: {
        tasks: summary.breakdown.tasks_score,
        tests: summary.breakdown.tests_score,
        corrections: summary.breakdown.corrections_score,
        budget: summary.breakdown.budget_score,
      },
    };
    this.entries.push(entry);
    // Trim to max
    if (this.entries.length > MAX_HISTORY_ENTRIES) {
      this.entries = this.entries.slice(this.entries.length - MAX_HISTORY_ENTRIES);
    }
    this.save();
  }

  /** Persist history to disk. Creates .elisa directory if needed. */
  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.entries, null, 2), 'utf-8');
    } catch {
      // Best-effort persistence
    }
  }

  /** Get all history entries. */
  getEntries(): HealthHistoryEntry[] {
    return [...this.entries];
  }

  /** Emit health_history event with all entries. */
  async emitHistory(send: SendEvent): Promise<void> {
    await send({
      type: 'health_history',
      entries: this.getEntries(),
    });
  }
}
