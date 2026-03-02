/** Health tracker: monitors system vital signs during and after execution. */

import type { SendEvent } from './phases/types.js';

export type HealthGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface HealthUpdate {
  tasks_done: number;
  tasks_total: number;
  tests_passing: number;
  tests_total: number;
  tokens_used: number;
  health_score: number;
}

export interface HealthSummary {
  health_score: number;
  grade: HealthGrade;
  breakdown: {
    tasks_score: number;
    tests_score: number;
    corrections_score: number;
    budget_score: number;
  };
}

/**
 * Tracks system health during execution.
 * Emits periodic system_health_update events and a final system_health_summary.
 *
 * Health score formula (0-100):
 *   (tasks_completed/total * 30) +
 *   (tests_passing/total * 40) +
 *   (no_correction_needed * 20) +
 *   (under_budget * 10)
 */
export class HealthTracker {
  private tasksDone = 0;
  private tasksTotal = 0;
  private testsPassing = 0;
  private testsTotal = 0;
  private tokensUsed = 0;
  private tokenBudget = 500_000;
  private correctionCycles = 0;

  /** Set the total number of tasks from the plan. */
  setTasksTotal(total: number): void {
    this.tasksTotal = total;
  }

  /** Record a task completion. */
  recordTaskDone(): void {
    this.tasksDone++;
  }

  /** Record test results. */
  recordTestResults(passing: number, total: number): void {
    this.testsPassing = passing;
    this.testsTotal = total;
  }

  /** Record token usage. */
  recordTokenUsage(tokens: number, budget?: number): void {
    this.tokensUsed = tokens;
    if (budget !== undefined) this.tokenBudget = budget;
  }

  /** Record that a correction cycle occurred. */
  recordCorrectionCycle(): void {
    this.correctionCycles++;
  }

  /** Compute the current health score. */
  computeScore(): number {
    const tasksScore = this.tasksTotal > 0
      ? (this.tasksDone / this.tasksTotal) * 30
      : 0;

    const testsScore = this.testsTotal > 0
      ? (this.testsPassing / this.testsTotal) * 40
      : 0;

    const correctionsScore = this.correctionCycles === 0 ? 20 : 0;

    const budgetScore = this.tokenBudget > 0 && this.tokensUsed <= this.tokenBudget
      ? 10
      : 0;

    return Math.round(tasksScore + testsScore + correctionsScore + budgetScore);
  }

  /** Map score to a letter grade. */
  static scoreToGrade(score: number): HealthGrade {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  /** Get the current health update payload. */
  getUpdate(): HealthUpdate {
    return {
      tasks_done: this.tasksDone,
      tasks_total: this.tasksTotal,
      tests_passing: this.testsPassing,
      tests_total: this.testsTotal,
      tokens_used: this.tokensUsed,
      health_score: this.computeScore(),
    };
  }

  /** Get the final health summary. */
  getSummary(): HealthSummary {
    const tasksScore = this.tasksTotal > 0
      ? Math.round((this.tasksDone / this.tasksTotal) * 30)
      : 0;

    const testsScore = this.testsTotal > 0
      ? Math.round((this.testsPassing / this.testsTotal) * 40)
      : 0;

    const correctionsScore = this.correctionCycles === 0 ? 20 : 0;

    const budgetScore = this.tokenBudget > 0 && this.tokensUsed <= this.tokenBudget
      ? 10
      : 0;

    const score = tasksScore + testsScore + correctionsScore + budgetScore;

    return {
      health_score: score,
      grade: HealthTracker.scoreToGrade(score),
      breakdown: {
        tasks_score: tasksScore,
        tests_score: testsScore,
        corrections_score: correctionsScore,
        budget_score: budgetScore,
      },
    };
  }

  /** Emit a health update event. */
  async emitUpdate(send: SendEvent): Promise<void> {
    const update = this.getUpdate();
    await send({
      type: 'system_health_update',
      ...update,
    });
  }

  /** Emit the final health summary event. */
  async emitSummary(send: SendEvent): Promise<void> {
    const summary = this.getSummary();
    await send({
      type: 'system_health_summary',
      ...summary,
    });
  }
}
