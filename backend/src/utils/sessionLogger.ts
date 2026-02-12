/** Structured session logging: JSONL for machine consumption, .log for humans, console for devs. */

import fs from 'node:fs';
import path from 'node:path';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  data?: Record<string, any>;
}

export class SessionLogger {
  private logDir: string;
  private jsonlPath: string;
  private textPath: string;
  private sessionStart: number;

  constructor(nuggetDir: string) {
    this.logDir = path.join(nuggetDir, '.elisa', 'logs');
    fs.mkdirSync(this.logDir, { recursive: true });
    this.jsonlPath = path.join(this.logDir, 'session.jsonl');
    this.textPath = path.join(this.logDir, 'session.log');
    this.sessionStart = Date.now();
  }

  /** Write a structured log entry. */
  log(level: LogLevel, event: string, data?: Record<string, any>): void {
    const timestamp = new Date().toISOString();
    const entry: LogEntry = { timestamp, level, event, ...(data !== undefined ? { data } : {}) };

    // JSONL
    try {
      fs.appendFileSync(this.jsonlPath, JSON.stringify(entry) + '\n');
    } catch { /* best-effort */ }

    // Human-readable
    const dataStr = data ? ' ' + this.formatData(data) : '';
    const textLine = `[${timestamp}] [${level.toUpperCase()}] ${event}${dataStr}\n`;
    try {
      fs.appendFileSync(this.textPath, textLine);
    } catch { /* best-effort */ }

    // Console with [elisa] prefix
    const consoleMsg = `[elisa] ${event}${dataStr}`;
    if (level === 'error') {
      console.error(consoleMsg);
    } else if (level === 'warn') {
      console.warn(consoleMsg);
    } else {
      console.log(consoleMsg);
    }
  }

  info(event: string, data?: Record<string, any>): void {
    this.log('info', event, data);
  }

  warn(event: string, data?: Record<string, any>): void {
    this.log('warn', event, data);
  }

  error(event: string, data?: Record<string, any>): void {
    this.log('error', event, data);
  }

  /** Log a phase transition. */
  phase(phase: string): void {
    this.info(`Phase: ${phase}`);
  }

  /** Log task start. Returns a function to call on completion that logs elapsed time. */
  taskStart(taskId: string, taskName: string, agentName: string): () => void {
    const start = Date.now();
    this.info(`Task started: ${taskName}`, { taskId, agentName });
    return () => {
      const elapsed = Date.now() - start;
      this.info(`Task completed: ${taskName}`, { taskId, agentName, elapsedMs: elapsed });
    };
  }

  /** Log task failure with timing. */
  taskFailed(taskId: string, taskName: string, error: string, elapsedMs: number): void {
    this.error(`Task failed: ${taskName}`, { taskId, error, elapsedMs });
  }

  /** Log agent output (full text). */
  agentOutput(taskId: string, agentName: string, content: string): void {
    this.log('debug', 'Agent output', { taskId, agentName, content });
  }

  /** Log token usage for an agent run. */
  tokenUsage(agentName: string, inputTokens: number, outputTokens: number, costUsd: number): void {
    this.info('Token usage', { agentName, inputTokens, outputTokens, costUsd });
  }

  /** Log test results. */
  testResults(passed: number, failed: number, total: number, coveragePct?: number): void {
    this.info('Test results', { passed, failed, total, ...(coveragePct != null ? { coveragePct } : {}) });
  }

  /** Log session summary with total elapsed time. */
  sessionSummary(tasksCompleted: number, tasksFailed: number, totalTasks: number): void {
    const elapsed = Date.now() - this.sessionStart;
    this.info('Session complete', {
      tasksCompleted,
      tasksFailed,
      totalTasks,
      totalElapsedMs: elapsed,
      totalElapsedStr: this.formatElapsed(elapsed),
    });
  }

  /** Format elapsed ms to human-readable string. */
  private formatElapsed(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    if (minutes === 0) return `${remaining}s`;
    return `${minutes}m ${remaining}s`;
  }

  /** Format data object for human-readable log line. */
  private formatData(data: Record<string, any>): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (key === 'content' && typeof value === 'string' && value.length > 200) {
        parts.push(`${key}=[${value.length} chars]`);
      } else if (typeof value === 'object') {
        parts.push(`${key}=${JSON.stringify(value)}`);
      } else {
        parts.push(`${key}=${value}`);
      }
    }
    return parts.join(', ');
  }
}
