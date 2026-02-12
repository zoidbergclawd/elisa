import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SessionLogger } from './sessionLogger.js';

let tmpDir: string;
let logger: SessionLogger;

function readJsonl(dir: string): any[] {
  const content = fs.readFileSync(path.join(dir, '.elisa', 'logs', 'session.jsonl'), 'utf-8');
  return content
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function readLog(dir: string): string {
  return fs.readFileSync(path.join(dir, '.elisa', 'logs', 'session.log'), 'utf-8');
}

/** Flush write streams so files are readable synchronously. */
function flushAndClose(l: SessionLogger): Promise<void> {
  return new Promise((resolve) => {
    l.close();
    // Give streams time to flush
    setTimeout(resolve, 50);
  });
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-logger-test-'));
  // Suppress console output during tests
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  if (logger) {
    await flushAndClose(logger);
  }
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('SessionLogger', () => {
  describe('constructor', () => {
    it('should create the log directory structure', () => {
      logger = new SessionLogger(tmpDir);
      const logDir = path.join(tmpDir, '.elisa', 'logs');
      expect(fs.existsSync(logDir)).toBe(true);
    });

    it('should create session.jsonl and session.log files', async () => {
      logger = new SessionLogger(tmpDir);
      logger.info('init');
      await flushAndClose(logger);
      const logDir = path.join(tmpDir, '.elisa', 'logs');
      expect(fs.existsSync(path.join(logDir, 'session.jsonl'))).toBe(true);
      expect(fs.existsSync(path.join(logDir, 'session.log'))).toBe(true);
    });
  });

  describe('log', () => {
    it('should write valid JSONL entries', async () => {
      logger = new SessionLogger(tmpDir);
      logger.log('info', 'test event', { key: 'value' });
      await flushAndClose(logger);

      const entries = readJsonl(tmpDir);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        level: 'info',
        event: 'test event',
        data: { key: 'value' },
      });
      expect(entries[0].timestamp).toBeDefined();
    });

    it('should omit data field when data is undefined', async () => {
      logger = new SessionLogger(tmpDir);
      logger.log('info', 'no data');
      await flushAndClose(logger);

      const entries = readJsonl(tmpDir);
      expect(entries[0]).not.toHaveProperty('data');
    });

    it('should write human-readable text lines', async () => {
      logger = new SessionLogger(tmpDir);
      logger.log('warn', 'something bad', { detail: 42 });
      await flushAndClose(logger);

      const text = readLog(tmpDir);
      expect(text).toContain('[WARN]');
      expect(text).toContain('something bad');
      expect(text).toContain('detail=42');
    });

    it('should log to console.error for error level', () => {
      logger = new SessionLogger(tmpDir);
      logger.log('error', 'err msg');
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[elisa] err msg'));
    });

    it('should log to console.warn for warn level', () => {
      logger = new SessionLogger(tmpDir);
      logger.log('warn', 'warn msg');
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('[elisa] warn msg'));
    });

    it('should log to console.log for info level', () => {
      logger = new SessionLogger(tmpDir);
      logger.log('info', 'info msg');
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[elisa] info msg'));
    });

    it('should log to console.log for debug level', () => {
      logger = new SessionLogger(tmpDir);
      logger.log('debug', 'debug msg');
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[elisa] debug msg'));
    });

    it('should write multiple entries', async () => {
      logger = new SessionLogger(tmpDir);
      logger.log('info', 'first');
      logger.log('warn', 'second');
      logger.log('error', 'third');
      await flushAndClose(logger);

      const entries = readJsonl(tmpDir);
      expect(entries).toHaveLength(3);
      expect(entries.map((e: any) => e.event)).toEqual(['first', 'second', 'third']);
    });
  });

  describe('convenience methods', () => {
    it('info() should log at info level', async () => {
      logger = new SessionLogger(tmpDir);
      logger.info('info event', { a: 1 });
      await flushAndClose(logger);

      const entries = readJsonl(tmpDir);
      expect(entries[0].level).toBe('info');
      expect(entries[0].event).toBe('info event');
      expect(entries[0].data).toEqual({ a: 1 });
    });

    it('warn() should log at warn level', async () => {
      logger = new SessionLogger(tmpDir);
      logger.warn('warn event');
      await flushAndClose(logger);

      const entries = readJsonl(tmpDir);
      expect(entries[0].level).toBe('warn');
    });

    it('error() should log at error level', async () => {
      logger = new SessionLogger(tmpDir);
      logger.error('error event');
      await flushAndClose(logger);

      const entries = readJsonl(tmpDir);
      expect(entries[0].level).toBe('error');
    });
  });

  describe('phase', () => {
    it('should log phase transition as info', async () => {
      logger = new SessionLogger(tmpDir);
      logger.phase('execute');
      await flushAndClose(logger);

      const entries = readJsonl(tmpDir);
      expect(entries[0]).toMatchObject({
        level: 'info',
        event: 'Phase: execute',
      });
    });
  });

  describe('taskStart', () => {
    it('should log task started and return a completion callback', async () => {
      logger = new SessionLogger(tmpDir);
      const done = logger.taskStart('t1', 'Build UI', 'builder');
      await flushAndClose(logger);

      const entries = readJsonl(tmpDir);
      expect(entries[0]).toMatchObject({
        level: 'info',
        event: 'Task started: Build UI',
        data: { taskId: 't1', agentName: 'builder' },
      });
      expect(typeof done).toBe('function');
    });

    it('completion callback should log elapsed time', async () => {
      logger = new SessionLogger(tmpDir);
      const done = logger.taskStart('t1', 'Build UI', 'builder');
      // Simulate work delay
      await new Promise((r) => setTimeout(r, 20));
      done();
      await flushAndClose(logger);

      const entries = readJsonl(tmpDir);
      expect(entries).toHaveLength(2);
      const completed = entries[1];
      expect(completed.event).toBe('Task completed: Build UI');
      expect(completed.data.taskId).toBe('t1');
      expect(completed.data.agentName).toBe('builder');
      expect(completed.data.elapsedMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('taskFailed', () => {
    it('should log task failure with error and timing', async () => {
      logger = new SessionLogger(tmpDir);
      logger.taskFailed('t2', 'Write tests', 'Timeout exceeded', 5000);
      await flushAndClose(logger);

      const entries = readJsonl(tmpDir);
      expect(entries[0]).toMatchObject({
        level: 'error',
        event: 'Task failed: Write tests',
        data: { taskId: 't2', error: 'Timeout exceeded', elapsedMs: 5000 },
      });
    });
  });

  describe('agentOutput', () => {
    it('should log agent output at debug level', async () => {
      logger = new SessionLogger(tmpDir);
      logger.agentOutput('t3', 'tester', 'All tests passed');
      await flushAndClose(logger);

      const entries = readJsonl(tmpDir);
      expect(entries[0]).toMatchObject({
        level: 'debug',
        event: 'Agent output',
        data: { taskId: 't3', agentName: 'tester', content: 'All tests passed' },
      });
    });
  });

  describe('tokenUsage', () => {
    it('should log token usage with all fields', async () => {
      logger = new SessionLogger(tmpDir);
      logger.tokenUsage('builder', 1500, 800, 0.12);
      await flushAndClose(logger);

      const entries = readJsonl(tmpDir);
      expect(entries[0]).toMatchObject({
        level: 'info',
        event: 'Token usage',
        data: { agentName: 'builder', inputTokens: 1500, outputTokens: 800, costUsd: 0.12 },
      });
    });
  });

  describe('testResults', () => {
    it('should log test results without coverage', async () => {
      logger = new SessionLogger(tmpDir);
      logger.testResults(10, 2, 12);
      await flushAndClose(logger);

      const entries = readJsonl(tmpDir);
      expect(entries[0]).toMatchObject({
        level: 'info',
        event: 'Test results',
        data: { passed: 10, failed: 2, total: 12 },
      });
      expect(entries[0].data).not.toHaveProperty('coveragePct');
    });

    it('should include coveragePct when provided', async () => {
      logger = new SessionLogger(tmpDir);
      logger.testResults(10, 0, 10, 85.5);
      await flushAndClose(logger);

      const entries = readJsonl(tmpDir);
      expect(entries[0].data.coveragePct).toBe(85.5);
    });

    it('should include coveragePct when value is 0', async () => {
      logger = new SessionLogger(tmpDir);
      logger.testResults(0, 5, 5, 0);
      await flushAndClose(logger);

      const entries = readJsonl(tmpDir);
      expect(entries[0].data.coveragePct).toBe(0);
    });
  });

  describe('sessionSummary', () => {
    it('should log session summary with elapsed time', async () => {
      logger = new SessionLogger(tmpDir);
      // Wait a bit so elapsed > 0
      await new Promise((r) => setTimeout(r, 10));
      logger.sessionSummary(5, 1, 6);
      await flushAndClose(logger);

      const entries = readJsonl(tmpDir);
      expect(entries[0]).toMatchObject({
        level: 'info',
        event: 'Session complete',
        data: {
          tasksCompleted: 5,
          tasksFailed: 1,
          totalTasks: 6,
        },
      });
      expect(entries[0].data.totalElapsedMs).toBeGreaterThanOrEqual(0);
      expect(entries[0].data.totalElapsedStr).toBeDefined();
    });

    it('should format elapsed time as seconds when under a minute', async () => {
      logger = new SessionLogger(tmpDir);
      logger.sessionSummary(1, 0, 1);
      await flushAndClose(logger);

      const entries = readJsonl(tmpDir);
      // Should match pattern like "0s" or "1s" etc
      expect(entries[0].data.totalElapsedStr).toMatch(/^\d+s$/);
    });
  });

  describe('close', () => {
    it('should not throw when called multiple times', () => {
      logger = new SessionLogger(tmpDir);
      expect(() => {
        logger.close();
        logger.close();
      }).not.toThrow();
    });
  });

  describe('formatData (via human-readable log)', () => {
    it('should format simple key-value pairs', async () => {
      logger = new SessionLogger(tmpDir);
      logger.info('test', { name: 'alice', count: 5 });
      await flushAndClose(logger);

      const text = readLog(tmpDir);
      expect(text).toContain('name=alice');
      expect(text).toContain('count=5');
    });

    it('should truncate content strings longer than 200 chars', async () => {
      logger = new SessionLogger(tmpDir);
      const longContent = 'x'.repeat(300);
      logger.info('test', { content: longContent });
      await flushAndClose(logger);

      const text = readLog(tmpDir);
      expect(text).toContain('content=[300 chars]');
      expect(text).not.toContain('x'.repeat(300));
    });

    it('should not truncate content strings at or under 200 chars', async () => {
      logger = new SessionLogger(tmpDir);
      const shortContent = 'y'.repeat(200);
      logger.info('test', { content: shortContent });
      await flushAndClose(logger);

      const text = readLog(tmpDir);
      expect(text).toContain(`content=${shortContent}`);
    });

    it('should JSON.stringify object values', async () => {
      logger = new SessionLogger(tmpDir);
      logger.info('test', { nested: { a: 1, b: 2 } });
      await flushAndClose(logger);

      const text = readLog(tmpDir);
      expect(text).toContain('nested={"a":1,"b":2}');
    });

    it('should handle data with no content key normally', async () => {
      logger = new SessionLogger(tmpDir);
      logger.info('test', { message: 'x'.repeat(300) });
      await flushAndClose(logger);

      const text = readLog(tmpDir);
      // 'message' is not 'content', so it should not be truncated
      expect(text).toContain(`message=${'x'.repeat(300)}`);
    });
  });

  describe('formatElapsed (via sessionSummary)', () => {
    it('should format minutes and seconds', async () => {
      const originalNow = Date.now;
      let callCount = 0;
      const baseTime = 1700000000000;
      vi.spyOn(Date, 'now').mockImplementation(() => {
        callCount++;
        // First call is constructor (sessionStart), subsequent are in methods
        if (callCount <= 1) return baseTime;
        return baseTime + 125000; // 2m 5s
      });

      logger = new SessionLogger(tmpDir);
      logger.sessionSummary(3, 0, 3);
      await flushAndClose(logger);

      const entries = readJsonl(tmpDir);
      expect(entries[0].data.totalElapsedStr).toBe('2m 5s');
      expect(entries[0].data.totalElapsedMs).toBe(125000);

      Date.now = originalNow;
    });

    it('should format 0 seconds', async () => {
      const originalNow = Date.now;
      const baseTime = 1700000000000;
      let callCount = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => {
        callCount++;
        if (callCount <= 1) return baseTime;
        return baseTime; // 0ms elapsed
      });

      logger = new SessionLogger(tmpDir);
      logger.sessionSummary(0, 0, 0);
      await flushAndClose(logger);

      const entries = readJsonl(tmpDir);
      expect(entries[0].data.totalElapsedStr).toBe('0s');

      Date.now = originalNow;
    });

    it('should format exactly 60 seconds as 1m 0s', async () => {
      const originalNow = Date.now;
      const baseTime = 1700000000000;
      let callCount = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => {
        callCount++;
        if (callCount <= 1) return baseTime;
        return baseTime + 60000;
      });

      logger = new SessionLogger(tmpDir);
      logger.sessionSummary(1, 0, 1);
      await flushAndClose(logger);

      const entries = readJsonl(tmpDir);
      expect(entries[0].data.totalElapsedStr).toBe('1m 0s');

      Date.now = originalNow;
    });
  });

  describe('best-effort error handling', () => {
    it('should not throw when writing after close', async () => {
      logger = new SessionLogger(tmpDir);
      logger.close();
      // Writing after close should not throw (best-effort)
      expect(() => logger.info('after close')).not.toThrow();
    });
  });
});
