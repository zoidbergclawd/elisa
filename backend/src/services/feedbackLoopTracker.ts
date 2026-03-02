/** Passive observer that tracks correction cycles per task and emits visualization events. */

import type { SendEvent } from './phases/types.js';
import type { MeetingRegistry } from './meetingRegistry.js';
import type { MeetingType } from '../models/meeting.js';

export type CorrectionStep = 'diagnosing' | 'fixing' | 'retesting';

export type ConvergenceTrend = 'improving' | 'stalled' | 'diverging';

export interface AttemptRecord {
  attempt_number: number;
  status: 'in_progress' | 'passed' | 'failed';
  failure_reason?: string;
  tests_passing?: number;
  tests_total?: number;
  timestamp: number;
}

export interface FeedbackLoop {
  task_id: string;
  task_name: string;
  attempts: AttemptRecord[];
  converged: boolean;
  current_step?: CorrectionStep;
  max_attempts: number;
}

/**
 * Tracks correction cycles during task execution.
 *
 * This is a passive observer: it does NOT change retry logic in executePhase.
 * It receives notifications about task retries and test results, and emits
 * visualization events so the frontend can render feedback loops.
 */
export class FeedbackLoopTracker {
  private loops = new Map<string, FeedbackLoop>();
  private send: SendEvent;
  private meetingRegistry?: MeetingRegistry;
  private stalledMeetingsFired = new Set<string>();

  constructor(send: SendEvent, meetingRegistry?: MeetingRegistry) {
    this.send = send;
    this.meetingRegistry = meetingRegistry;
  }

  /** Called when a task begins its first attempt or a retry attempt. */
  async startAttempt(
    taskId: string,
    taskName: string,
    attemptNumber: number,
    failureReason?: string,
  ): Promise<void> {
    let loop = this.loops.get(taskId);

    if (!loop) {
      loop = {
        task_id: taskId,
        task_name: taskName,
        attempts: [],
        converged: false,
        max_attempts: 3, // attempt 0 + 2 retries
      };
      this.loops.set(taskId, loop);
    }

    const attempt: AttemptRecord = {
      attempt_number: attemptNumber,
      status: 'in_progress',
      failure_reason: failureReason,
      timestamp: Date.now(),
    };
    loop.attempts.push(attempt);

    // Only emit correction cycle events on retries (attempt > 0)
    if (attemptNumber > 0) {
      loop.current_step = 'diagnosing';

      await this.send({
        type: 'correction_cycle_started',
        task_id: taskId,
        attempt_number: attemptNumber,
        failure_reason: failureReason ?? 'Previous attempt did not complete successfully',
        max_attempts: loop.max_attempts,
      });

      await this.send({
        type: 'correction_cycle_progress',
        task_id: taskId,
        attempt_number: attemptNumber,
        step: 'diagnosing',
      });
    }
  }

  /** Called when the agent is actively working on a fix (during retry). */
  async markFixing(taskId: string): Promise<void> {
    const loop = this.loops.get(taskId);
    if (!loop) return;

    const currentAttempt = loop.attempts[loop.attempts.length - 1];
    if (!currentAttempt || currentAttempt.attempt_number === 0) return;

    loop.current_step = 'fixing';

    await this.send({
      type: 'correction_cycle_progress',
      task_id: taskId,
      attempt_number: currentAttempt.attempt_number,
      step: 'fixing',
    });
  }

  /** Called when retesting begins during a retry cycle. */
  async markRetesting(taskId: string): Promise<void> {
    const loop = this.loops.get(taskId);
    if (!loop) return;

    const currentAttempt = loop.attempts[loop.attempts.length - 1];
    if (!currentAttempt || currentAttempt.attempt_number === 0) return;

    loop.current_step = 'retesting';

    await this.send({
      type: 'correction_cycle_progress',
      task_id: taskId,
      attempt_number: currentAttempt.attempt_number,
      step: 'retesting',
    });
  }

  /** Called when a task attempt completes (success or failure). */
  async recordAttemptResult(
    taskId: string,
    passed: boolean,
    testsPassing?: number,
    testsTotal?: number,
  ): Promise<void> {
    const loop = this.loops.get(taskId);
    if (!loop) return;

    const currentAttempt = loop.attempts[loop.attempts.length - 1];
    if (!currentAttempt) return;

    currentAttempt.status = passed ? 'passed' : 'failed';
    currentAttempt.tests_passing = testsPassing;
    currentAttempt.tests_total = testsTotal;

    if (passed) {
      loop.converged = true;
      loop.current_step = undefined;
    }

    const trend = this.computeTrend(loop);
    const attemptsSoFar = loop.attempts.length;

    await this.send({
      type: 'convergence_update',
      task_id: taskId,
      attempts_so_far: attemptsSoFar,
      tests_passing: testsPassing ?? (passed ? 1 : 0),
      tests_total: testsTotal ?? 1,
      trend,
      converged: passed,
      attempts: loop.attempts.map(a => ({
        attempt_number: a.attempt_number,
        status: a.status,
        tests_passing: a.tests_passing,
        tests_total: a.tests_total,
      })),
    });

    // Check for stalled convergence and suggest a Test Agent Meeting
    if (!passed && trend !== 'improving' && attemptsSoFar >= 2) {
      await this.suggestDebugMeeting(taskId, loop);
    }
  }

  /** Compute the convergence trend from attempt history. */
  computeTrend(loop: FeedbackLoop): ConvergenceTrend {
    const completed = loop.attempts.filter(a => a.status !== 'in_progress');
    if (completed.length < 2) return 'improving'; // not enough data yet

    const last = completed[completed.length - 1];
    const prev = completed[completed.length - 2];

    // Compare test passing ratios
    const lastRatio = (last.tests_passing ?? 0) / Math.max(last.tests_total ?? 1, 1);
    const prevRatio = (prev.tests_passing ?? 0) / Math.max(prev.tests_total ?? 1, 1);

    if (lastRatio > prevRatio) return 'improving';
    if (lastRatio < prevRatio) return 'diverging';
    return 'stalled';
  }

  /** Suggest a Test Agent Meeting when convergence stalls. */
  private async suggestDebugMeeting(taskId: string, loop: FeedbackLoop): Promise<void> {
    // Only fire once per task
    if (this.stalledMeetingsFired.has(taskId)) return;
    this.stalledMeetingsFired.add(taskId);

    if (!this.meetingRegistry) return;

    // Look for a meeting type that triggers on convergence_stalled
    const debugMeeting = this.findDebugMeetingType();
    if (!debugMeeting) return;

    const meetingId = `meeting-debug-${taskId}-${Date.now()}`;

    await this.send({
      type: 'meeting_invite',
      meetingTypeId: debugMeeting.id,
      meetingId,
      agentName: debugMeeting.agentName,
      title: `Debug: ${loop.task_name}`,
      description: `The system has tried ${loop.attempts.length} times but isn't making progress. Let's figure this out together!`,
    });
  }

  /** Find a registered meeting type for debug/convergence_stalled. */
  private findDebugMeetingType(): MeetingType | undefined {
    if (!this.meetingRegistry) return undefined;

    for (const mt of this.meetingRegistry.getAll()) {
      for (const cond of mt.triggerConditions) {
        if (cond.event === 'convergence_stalled') return mt;
      }
    }
    return undefined;
  }

  /** Get a feedback loop by task ID. */
  getLoop(taskId: string): FeedbackLoop | undefined {
    return this.loops.get(taskId);
  }

  /** Get all active feedback loops. */
  getAllLoops(): FeedbackLoop[] {
    return Array.from(this.loops.values());
  }

  /** Check if a task has an active correction cycle (retrying). */
  isInCorrectionCycle(taskId: string): boolean {
    const loop = this.loops.get(taskId);
    if (!loop) return false;
    return loop.attempts.length > 1 && !loop.converged;
  }

  /** Reset all state (e.g., between sessions). */
  reset(): void {
    this.loops.clear();
    this.stalledMeetingsFired.clear();
  }
}
