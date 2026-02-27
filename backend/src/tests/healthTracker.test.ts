import { describe, it, expect, vi } from 'vitest';
import { HealthTracker } from '../services/healthTracker.js';

describe('HealthTracker', () => {
  it('starts with base score (no corrections + under budget)', () => {
    const tracker = new HealthTracker();
    // No tasks or tests, but no corrections and under budget
    // corrections_score = 20, budget_score = 10
    expect(tracker.computeScore()).toBe(30);
  });

  it('computes full score when everything passes', () => {
    const tracker = new HealthTracker();
    tracker.setTasksTotal(5);
    for (let i = 0; i < 5; i++) tracker.recordTaskDone();
    tracker.recordTestResults(10, 10);
    tracker.recordTokenUsage(100_000, 500_000);
    // No correction cycles
    expect(tracker.computeScore()).toBe(100);
  });

  it('computes partial score with some failures', () => {
    const tracker = new HealthTracker();
    tracker.setTasksTotal(4);
    tracker.recordTaskDone(); // 1/4 done
    tracker.recordTestResults(3, 5); // 3/5 passing
    tracker.recordTokenUsage(100_000, 500_000);
    // No corrections = 20 points

    // tasks_score = (1/4) * 30 = 7.5 -> 8
    // tests_score = (3/5) * 40 = 24
    // corrections_score = 20
    // budget_score = 10
    const score = tracker.computeScore();
    expect(score).toBe(Math.round(7.5 + 24 + 20 + 10));
  });

  it('deducts corrections score when correction cycles occur', () => {
    const tracker = new HealthTracker();
    tracker.setTasksTotal(2);
    tracker.recordTaskDone();
    tracker.recordTaskDone();
    tracker.recordTestResults(5, 5);
    tracker.recordTokenUsage(100_000, 500_000);
    tracker.recordCorrectionCycle();

    // tasks_score = (2/2) * 30 = 30
    // tests_score = (5/5) * 40 = 40
    // corrections_score = 0 (had corrections)
    // budget_score = 10
    expect(tracker.computeScore()).toBe(80);
  });

  it('deducts budget score when over budget', () => {
    const tracker = new HealthTracker();
    tracker.setTasksTotal(1);
    tracker.recordTaskDone();
    tracker.recordTestResults(1, 1);
    tracker.recordTokenUsage(600_000, 500_000); // Over budget!

    // tasks_score = 30
    // tests_score = 40
    // corrections_score = 20
    // budget_score = 0
    expect(tracker.computeScore()).toBe(90);
  });

  it('maps scores to correct grades', () => {
    expect(HealthTracker.scoreToGrade(95)).toBe('A');
    expect(HealthTracker.scoreToGrade(90)).toBe('A');
    expect(HealthTracker.scoreToGrade(85)).toBe('B');
    expect(HealthTracker.scoreToGrade(75)).toBe('C');
    expect(HealthTracker.scoreToGrade(65)).toBe('D');
    expect(HealthTracker.scoreToGrade(50)).toBe('F');
    expect(HealthTracker.scoreToGrade(0)).toBe('F');
  });

  it('getSummary returns correct breakdown', () => {
    const tracker = new HealthTracker();
    tracker.setTasksTotal(10);
    for (let i = 0; i < 8; i++) tracker.recordTaskDone();
    tracker.recordTestResults(7, 10);
    tracker.recordTokenUsage(400_000, 500_000);

    const summary = tracker.getSummary();
    expect(summary.grade).toBeDefined();
    expect(summary.health_score).toBeGreaterThan(0);
    expect(summary.breakdown.tasks_score).toBe(Math.round((8 / 10) * 30));
    expect(summary.breakdown.tests_score).toBe(Math.round((7 / 10) * 40));
    expect(summary.breakdown.corrections_score).toBe(20);
    expect(summary.breakdown.budget_score).toBe(10);
  });

  it('getUpdate returns current state', () => {
    const tracker = new HealthTracker();
    tracker.setTasksTotal(3);
    tracker.recordTaskDone();
    tracker.recordTestResults(2, 4);
    tracker.recordTokenUsage(50_000);

    const update = tracker.getUpdate();
    expect(update.tasks_done).toBe(1);
    expect(update.tasks_total).toBe(3);
    expect(update.tests_passing).toBe(2);
    expect(update.tests_total).toBe(4);
    expect(update.tokens_used).toBe(50_000);
    expect(update.health_score).toBeGreaterThanOrEqual(0);
  });

  it('emitUpdate calls send with correct event type', async () => {
    const tracker = new HealthTracker();
    tracker.setTasksTotal(2);
    tracker.recordTaskDone();

    const send = vi.fn().mockResolvedValue(undefined);
    await tracker.emitUpdate(send);

    expect(send).toHaveBeenCalledOnce();
    const event = send.mock.calls[0][0];
    expect(event.type).toBe('system_health_update');
    expect(event.tasks_done).toBe(1);
    expect(event.tasks_total).toBe(2);
  });

  it('emitSummary calls send with correct event type', async () => {
    const tracker = new HealthTracker();
    tracker.setTasksTotal(1);
    tracker.recordTaskDone();
    tracker.recordTestResults(1, 1);
    tracker.recordTokenUsage(10_000, 500_000);

    const send = vi.fn().mockResolvedValue(undefined);
    await tracker.emitSummary(send);

    expect(send).toHaveBeenCalledOnce();
    const event = send.mock.calls[0][0];
    expect(event.type).toBe('system_health_summary');
    expect(event.grade).toBeDefined();
    expect(event.breakdown).toBeDefined();
  });
});
