import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { HealthHistoryService } from './healthHistoryService.js';
import type { HealthSummary } from './healthTracker.js';

function makeSummary(score: number, grade: 'A' | 'B' | 'C' | 'D' | 'F'): HealthSummary {
  return {
    health_score: score,
    grade,
    breakdown: {
      tasks_score: Math.min(score, 30),
      tests_score: Math.min(Math.max(score - 30, 0), 40),
      corrections_score: score >= 80 ? 20 : 0,
      budget_score: 10,
    },
  };
}

describe('HealthHistoryService', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'health-history-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('starts with empty entries when no file exists', () => {
    const svc = new HealthHistoryService(tmpDir);
    svc.load();
    expect(svc.getEntries()).toEqual([]);
  });

  it('records a build and persists to disk', () => {
    const svc = new HealthHistoryService(tmpDir);
    svc.load();
    svc.record('Build a snake game', makeSummary(85, 'B'));

    const entries = svc.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].goal).toBe('Build a snake game');
    expect(entries[0].score).toBe(85);
    expect(entries[0].grade).toBe('B');
    expect(entries[0].breakdown.tasks).toBe(30);

    // Verify file was written
    const filePath = path.join(tmpDir, '.elisa', 'health-history.json');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('loads existing history from disk', () => {
    // Write first
    const svc1 = new HealthHistoryService(tmpDir);
    svc1.load();
    svc1.record('Build v1', makeSummary(60, 'D'));
    svc1.record('Build v2', makeSummary(80, 'B'));

    // Load in new instance
    const svc2 = new HealthHistoryService(tmpDir);
    svc2.load();
    const entries = svc2.getEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0].goal).toBe('Build v1');
    expect(entries[1].goal).toBe('Build v2');
  });

  it('trims to max 20 entries', () => {
    const svc = new HealthHistoryService(tmpDir);
    svc.load();

    for (let i = 0; i < 25; i++) {
      svc.record(`Build ${i}`, makeSummary(50 + i, 'C'));
    }

    const entries = svc.getEntries();
    expect(entries).toHaveLength(20);
    // Oldest should be trimmed; first entry should be Build 5
    expect(entries[0].goal).toBe('Build 5');
    expect(entries[19].goal).toBe('Build 24');
  });

  it('handles corrupted file gracefully', () => {
    const elisaDir = path.join(tmpDir, '.elisa');
    fs.mkdirSync(elisaDir, { recursive: true });
    fs.writeFileSync(path.join(elisaDir, 'health-history.json'), 'not json!', 'utf-8');

    const svc = new HealthHistoryService(tmpDir);
    svc.load();
    expect(svc.getEntries()).toEqual([]);
  });

  it('handles non-array JSON gracefully', () => {
    const elisaDir = path.join(tmpDir, '.elisa');
    fs.mkdirSync(elisaDir, { recursive: true });
    fs.writeFileSync(path.join(elisaDir, 'health-history.json'), '{"not": "array"}', 'utf-8');

    const svc = new HealthHistoryService(tmpDir);
    svc.load();
    expect(svc.getEntries()).toEqual([]);
  });

  it('emitHistory sends health_history event', async () => {
    const svc = new HealthHistoryService(tmpDir);
    svc.load();
    svc.record('Test build', makeSummary(90, 'A'));

    const send = vi.fn();
    await svc.emitHistory(send);

    expect(send).toHaveBeenCalledOnce();
    const event = send.mock.calls[0][0];
    expect(event.type).toBe('health_history');
    expect(event.entries).toHaveLength(1);
    expect(event.entries[0].score).toBe(90);
    expect(event.entries[0].grade).toBe('A');
  });

  it('getEntries returns a copy, not internal reference', () => {
    const svc = new HealthHistoryService(tmpDir);
    svc.load();
    svc.record('Build', makeSummary(70, 'C'));

    const entries1 = svc.getEntries();
    const entries2 = svc.getEntries();
    expect(entries1).not.toBe(entries2);
    expect(entries1).toEqual(entries2);
  });

  it('records breakdown fields correctly from summary', () => {
    const svc = new HealthHistoryService(tmpDir);
    svc.load();
    const summary: HealthSummary = {
      health_score: 75,
      grade: 'C',
      breakdown: {
        tasks_score: 25,
        tests_score: 30,
        corrections_score: 10,
        budget_score: 10,
      },
    };
    svc.record('Custom build', summary);

    const entry = svc.getEntries()[0];
    expect(entry.breakdown).toEqual({
      tasks: 25,
      tests: 30,
      corrections: 10,
      budget: 10,
    });
  });
});
