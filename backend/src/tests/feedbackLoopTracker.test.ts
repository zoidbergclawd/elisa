import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeedbackLoopTracker } from '../services/feedbackLoopTracker.js';
import { MeetingRegistry } from '../services/meetingRegistry.js';
import type { MeetingType } from '../models/meeting.js';

function makeSend() {
  const events: Record<string, any>[] = [];
  const send = vi.fn(async (event: Record<string, any>) => {
    events.push(event);
  });
  return { send, events };
}

function makeDebugMeetingType(): MeetingType {
  return {
    id: 'debug-convergence',
    name: 'Bug Detective Meeting',
    agentName: 'Bug Detective',
    canvasType: 'default',
    triggerConditions: [{ event: 'convergence_stalled' }],
    persona: 'A friendly debugging expert.',
  };
}

describe('FeedbackLoopTracker', () => {
  let tracker: FeedbackLoopTracker;
  let send: ReturnType<typeof vi.fn>;
  let events: Record<string, any>[];

  beforeEach(() => {
    const s = makeSend();
    send = s.send;
    events = s.events;
    tracker = new FeedbackLoopTracker(send as any);
  });

  it('starts with no loops', () => {
    expect(tracker.getAllLoops()).toHaveLength(0);
    expect(tracker.getLoop('task-1')).toBeUndefined();
    expect(tracker.isInCorrectionCycle('task-1')).toBe(false);
  });

  it('creates a loop on first attempt', async () => {
    await tracker.startAttempt('task-1', 'Build login', 0);

    const loop = tracker.getLoop('task-1');
    expect(loop).toBeDefined();
    expect(loop!.task_id).toBe('task-1');
    expect(loop!.task_name).toBe('Build login');
    expect(loop!.attempts).toHaveLength(1);
    expect(loop!.attempts[0].attempt_number).toBe(0);
    expect(loop!.attempts[0].status).toBe('in_progress');
    expect(loop!.converged).toBe(false);
  });

  it('does not emit correction_cycle_started on attempt 0', async () => {
    await tracker.startAttempt('task-1', 'Build login', 0);
    const correctionEvents = events.filter(e => e.type === 'correction_cycle_started');
    expect(correctionEvents).toHaveLength(0);
  });

  it('emits correction_cycle_started on retry (attempt > 0)', async () => {
    await tracker.startAttempt('task-1', 'Build login', 0);
    await tracker.recordAttemptResult('task-1', false);
    events.length = 0; // clear events

    await tracker.startAttempt('task-1', 'Build login', 1, 'Tests failed');

    const started = events.filter(e => e.type === 'correction_cycle_started');
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({
      type: 'correction_cycle_started',
      task_id: 'task-1',
      attempt_number: 1,
      failure_reason: 'Tests failed',
      max_attempts: 3,
    });

    // Also emits initial progress (diagnosing)
    const progress = events.filter(e => e.type === 'correction_cycle_progress');
    expect(progress).toHaveLength(1);
    expect(progress[0].step).toBe('diagnosing');
  });

  it('emits correction_cycle_progress for fixing and retesting', async () => {
    await tracker.startAttempt('task-1', 'Build login', 0);
    await tracker.recordAttemptResult('task-1', false);
    await tracker.startAttempt('task-1', 'Build login', 1, 'Failed');
    events.length = 0;

    await tracker.markFixing('task-1');
    expect(events[0]).toMatchObject({
      type: 'correction_cycle_progress',
      task_id: 'task-1',
      step: 'fixing',
    });

    await tracker.markRetesting('task-1');
    expect(events[1]).toMatchObject({
      type: 'correction_cycle_progress',
      task_id: 'task-1',
      step: 'retesting',
    });
  });

  it('does not emit fixing/retesting for attempt 0', async () => {
    await tracker.startAttempt('task-1', 'Build login', 0);
    events.length = 0;

    await tracker.markFixing('task-1');
    await tracker.markRetesting('task-1');

    expect(events).toHaveLength(0);
  });

  it('records successful attempt and marks converged', async () => {
    await tracker.startAttempt('task-1', 'Build login', 0);
    await tracker.recordAttemptResult('task-1', true, 5, 5);

    const loop = tracker.getLoop('task-1');
    expect(loop!.converged).toBe(true);
    expect(loop!.attempts[0].status).toBe('passed');
    expect(loop!.attempts[0].tests_passing).toBe(5);
    expect(loop!.attempts[0].tests_total).toBe(5);
  });

  it('emits convergence_update on attempt result', async () => {
    await tracker.startAttempt('task-1', 'Build login', 0);
    events.length = 0;

    await tracker.recordAttemptResult('task-1', false, 3, 5);

    const updates = events.filter(e => e.type === 'convergence_update');
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      type: 'convergence_update',
      task_id: 'task-1',
      attempts_so_far: 1,
      tests_passing: 3,
      tests_total: 5,
      converged: false,
    });
  });

  describe('convergence trend detection', () => {
    it('returns improving when tests pass ratio increases', async () => {
      await tracker.startAttempt('task-1', 'Test', 0);
      await tracker.recordAttemptResult('task-1', false, 2, 5);
      await tracker.startAttempt('task-1', 'Test', 1, 'Failed');
      await tracker.recordAttemptResult('task-1', false, 4, 5);

      const loop = tracker.getLoop('task-1')!;
      expect(tracker.computeTrend(loop)).toBe('improving');
    });

    it('returns stalled when tests pass ratio stays the same', async () => {
      await tracker.startAttempt('task-1', 'Test', 0);
      await tracker.recordAttemptResult('task-1', false, 3, 5);
      await tracker.startAttempt('task-1', 'Test', 1, 'Failed');
      await tracker.recordAttemptResult('task-1', false, 3, 5);

      const loop = tracker.getLoop('task-1')!;
      expect(tracker.computeTrend(loop)).toBe('stalled');
    });

    it('returns diverging when tests pass ratio decreases', async () => {
      await tracker.startAttempt('task-1', 'Test', 0);
      await tracker.recordAttemptResult('task-1', false, 4, 5);
      await tracker.startAttempt('task-1', 'Test', 1, 'Failed');
      await tracker.recordAttemptResult('task-1', false, 2, 5);

      const loop = tracker.getLoop('task-1')!;
      expect(tracker.computeTrend(loop)).toBe('diverging');
    });

    it('returns improving with insufficient data (< 2 completed)', async () => {
      await tracker.startAttempt('task-1', 'Test', 0);

      const loop = tracker.getLoop('task-1')!;
      expect(tracker.computeTrend(loop)).toBe('improving');
    });
  });

  describe('debug meeting trigger', () => {
    it('emits meeting_invite when convergence stalls after 2+ attempts', async () => {
      const registry = new MeetingRegistry();
      registry.register(makeDebugMeetingType());
      const s = makeSend();
      const t = new FeedbackLoopTracker(s.send as any, registry);

      await t.startAttempt('task-1', 'Build login', 0);
      await t.recordAttemptResult('task-1', false, 3, 5);
      await t.startAttempt('task-1', 'Build login', 1, 'Failed');
      await t.recordAttemptResult('task-1', false, 3, 5); // stalled

      const invites = s.events.filter(e => e.type === 'meeting_invite');
      expect(invites).toHaveLength(1);
      expect(invites[0]).toMatchObject({
        type: 'meeting_invite',
        meetingTypeId: 'debug-convergence',
        agentName: 'Bug Detective',
      });
      expect(invites[0].title).toContain('Build login');
    });

    it('does not emit meeting_invite when trend is improving', async () => {
      const registry = new MeetingRegistry();
      registry.register(makeDebugMeetingType());
      const s = makeSend();
      const t = new FeedbackLoopTracker(s.send as any, registry);

      await t.startAttempt('task-1', 'Build login', 0);
      await t.recordAttemptResult('task-1', false, 2, 5);
      await t.startAttempt('task-1', 'Build login', 1, 'Failed');
      await t.recordAttemptResult('task-1', false, 4, 5); // improving

      const invites = s.events.filter(e => e.type === 'meeting_invite');
      expect(invites).toHaveLength(0);
    });

    it('only fires meeting_invite once per task', async () => {
      const registry = new MeetingRegistry();
      registry.register(makeDebugMeetingType());
      const s = makeSend();
      const t = new FeedbackLoopTracker(s.send as any, registry);

      await t.startAttempt('task-1', 'Build login', 0);
      await t.recordAttemptResult('task-1', false, 3, 5);
      await t.startAttempt('task-1', 'Build login', 1, 'Failed');
      await t.recordAttemptResult('task-1', false, 3, 5); // stalled -> invite fires
      await t.startAttempt('task-1', 'Build login', 2, 'Failed');
      await t.recordAttemptResult('task-1', false, 3, 5); // stalled again, but no new invite

      const invites = s.events.filter(e => e.type === 'meeting_invite');
      expect(invites).toHaveLength(1);
    });

    it('does not emit meeting_invite when no registry provided', async () => {
      const s = makeSend();
      const t = new FeedbackLoopTracker(s.send as any);

      await t.startAttempt('task-1', 'Build login', 0);
      await t.recordAttemptResult('task-1', false, 3, 5);
      await t.startAttempt('task-1', 'Build login', 1, 'Failed');
      await t.recordAttemptResult('task-1', false, 3, 5);

      const invites = s.events.filter(e => e.type === 'meeting_invite');
      expect(invites).toHaveLength(0);
    });

    it('does not emit meeting_invite when no debug meeting type registered', async () => {
      const registry = new MeetingRegistry();
      // No debug meeting type registered
      const s = makeSend();
      const t = new FeedbackLoopTracker(s.send as any, registry);

      await t.startAttempt('task-1', 'Build login', 0);
      await t.recordAttemptResult('task-1', false, 3, 5);
      await t.startAttempt('task-1', 'Build login', 1, 'Failed');
      await t.recordAttemptResult('task-1', false, 3, 5);

      const invites = s.events.filter(e => e.type === 'meeting_invite');
      expect(invites).toHaveLength(0);
    });
  });

  it('isInCorrectionCycle returns true during retries', async () => {
    await tracker.startAttempt('task-1', 'Build login', 0);
    expect(tracker.isInCorrectionCycle('task-1')).toBe(false); // only 1 attempt

    await tracker.recordAttemptResult('task-1', false);
    await tracker.startAttempt('task-1', 'Build login', 1, 'Failed');
    expect(tracker.isInCorrectionCycle('task-1')).toBe(true);
  });

  it('isInCorrectionCycle returns false when converged', async () => {
    await tracker.startAttempt('task-1', 'Build login', 0);
    await tracker.recordAttemptResult('task-1', false);
    await tracker.startAttempt('task-1', 'Build login', 1, 'Failed');
    await tracker.recordAttemptResult('task-1', true);

    expect(tracker.isInCorrectionCycle('task-1')).toBe(false);
  });

  it('reset clears all state', async () => {
    await tracker.startAttempt('task-1', 'Build login', 0);
    tracker.reset();

    expect(tracker.getAllLoops()).toHaveLength(0);
    expect(tracker.getLoop('task-1')).toBeUndefined();
  });

  it('tracks multiple tasks independently', async () => {
    await tracker.startAttempt('task-1', 'Build login', 0);
    await tracker.startAttempt('task-2', 'Build signup', 0);

    expect(tracker.getAllLoops()).toHaveLength(2);
    expect(tracker.getLoop('task-1')!.task_name).toBe('Build login');
    expect(tracker.getLoop('task-2')!.task_name).toBe('Build signup');
  });
});
