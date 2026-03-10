import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeetingRegistry } from '../services/meetingRegistry.js';
import { MeetingService } from '../services/meetingService.js';
import { MeetingTriggerWiring } from '../services/meetingTriggerWiring.js';
import { registerBuddyAgentMeeting } from '../services/buddyAgentMeeting.js';
import { registerDocAgentMeeting } from '../services/docAgentMeeting.js';
import { registerMediaAgentMeeting } from '../services/mediaAgentMeeting.js';
import { registerArchitectureAgentMeeting } from '../services/architectureAgentMeeting.js';
import type { NuggetSpec } from '../utils/specValidator.js';

describe('MeetingTriggerWiring team filtering', () => {
  let registry: MeetingRegistry;
  let service: MeetingService;
  let wiring: MeetingTriggerWiring;
  const send = vi.fn();
  const sessionId = 'test-session';

  beforeEach(() => {
    registry = new MeetingRegistry();
    registerBuddyAgentMeeting(registry);
    registerDocAgentMeeting(registry);
    registerMediaAgentMeeting(registry);
    registerArchitectureAgentMeeting(registry);
    // Register debug-convergence (always-on)
    registry.register({
      id: 'debug-convergence',
      name: 'Bug Detective',
      agentName: 'Bug Detective',
      canvasType: 'bug-detective',
      triggerConditions: [{ event: 'convergence_stalled' }],
      persona: 'Debug expert',
    });

    service = new MeetingService(registry);
    wiring = new MeetingTriggerWiring(registry, service);
    send.mockReset();
  });

  it('always-on defaults fire without team blocks', async () => {
    // buddy-agent is always-on and triggers at 25%
    const spec: NuggetSpec = { nugget: { goal: 'test' } };
    wiring.setSpec(sessionId, spec);

    await wiring.evaluateAndInvite(
      'task_completed',
      { tasks_done: 1, tasks_total: 4 },
      sessionId, send, 'explorer',
    );

    // buddy-agent and doc-agent both match at 25%, but doc-agent requires 50%
    // Only buddy-agent (always-on) should fire
    const inviteCalls = send.mock.calls.filter(
      (c: unknown[]) => (c[0] as { type: string }).type === 'meeting_invite',
    );
    const invitedIds = inviteCalls.map((c: unknown[]) => (c[0] as { meetingTypeId: string }).meetingTypeId);
    expect(invitedIds).toContain('buddy-agent');
    // media-agent is NOT always-on and no team blocks selected it
    expect(invitedIds).not.toContain('media-agent');
  });

  it('opt-in agent fires when selected via team blocks', async () => {
    const spec: NuggetSpec = {
      nugget: { goal: 'test' },
      meeting_team: [{ type: 'builtin', meetingTypeId: 'media-agent' }],
    };
    wiring.setSpec(sessionId, spec);

    await wiring.evaluateAndInvite(
      'task_completed',
      { tasks_done: 1, tasks_total: 4 },
      sessionId, send, 'explorer',
    );

    const inviteCalls = send.mock.calls.filter(
      (c: unknown[]) => (c[0] as { type: string }).type === 'meeting_invite',
    );
    const invitedIds = inviteCalls.map((c: unknown[]) => (c[0] as { meetingTypeId: string }).meetingTypeId);
    expect(invitedIds).toContain('media-agent');
    expect(invitedIds).toContain('buddy-agent'); // still fires (always-on)
  });

  it('architecture-agent always fires on session_complete (always-on)', async () => {
    const spec: NuggetSpec = { nugget: { goal: 'test' } };
    wiring.setSpec(sessionId, spec);

    await wiring.evaluateAndInvite(
      'session_complete',
      { tasks_done: 4, tasks_total: 4 },
      sessionId, send, 'explorer',
    );

    const inviteCalls = send.mock.calls.filter(
      (c: unknown[]) => (c[0] as { type: string }).type === 'meeting_invite',
    );
    const invitedIds = inviteCalls.map((c: unknown[]) => (c[0] as { meetingTypeId: string }).meetingTypeId);
    expect(invitedIds).toContain('architecture-agent');
  });

  it('evaluateAndInviteForTask also applies team filter', async () => {
    const spec: NuggetSpec = { nugget: { goal: 'test' } };
    wiring.setSpec(sessionId, spec);

    // design-task-agent is always-on, so it should fire for matching tasks
    // But we need to register it first
    registry.register({
      id: 'design-task-agent',
      name: 'Design Review',
      agentName: 'Pixel',
      canvasType: 'design-preview',
      triggerConditions: [{
        event: 'task_starting',
        filter: (data) => /sprite|art|icon/.test(String(data.task_title).toLowerCase()),
      }],
      persona: 'Design review expert',
    });

    const meetingIds = await wiring.evaluateAndInviteForTask(
      {
        task_id: 't1',
        task_title: 'Create sprite animations',
        task_description: 'Animate the main character',
        agent_name: 'Builder',
        agent_role: 'builder',
      },
      sessionId, send, 'explorer',
    );

    // design-task-agent is always-on
    expect(meetingIds.length).toBeGreaterThan(0);
  });

  it('custom agent fires when dynamically registered and spec has matching meetingTypeId', async () => {
    // Simulate the orchestrator flow: registerDynamic + backfill meetingTypeId on spec
    const dynamicIds = registry.registerDynamic(sessionId, [
      { name: 'Coach', persona: 'Gives tips', canvasType: 'explain-it' },
    ]);
    expect(dynamicIds).toHaveLength(1);
    const customId = dynamicIds[0]; // e.g. 'custom-test-session-0'

    const spec: NuggetSpec = {
      nugget: { goal: 'test' },
      meeting_team: [{ type: 'custom', meetingTypeId: customId }],
    };
    wiring.setSpec(sessionId, spec);

    // explain-it trigger fires at 40%+ completion: ceil(4 * 0.4) = 2
    await wiring.evaluateAndInvite(
      'task_completed',
      { tasks_done: 2, tasks_total: 4 },
      sessionId, send, 'explorer',
    );

    const inviteCalls = send.mock.calls.filter(
      (c: unknown[]) => (c[0] as { type: string }).type === 'meeting_invite',
    );
    const invitedIds = inviteCalls.map((c: unknown[]) => (c[0] as { meetingTypeId: string }).meetingTypeId);
    expect(invitedIds).toContain(customId);
  });

  it('custom agent does NOT fire when meetingTypeId is missing from spec', async () => {
    // Register dynamic agent but don't backfill meetingTypeId on the spec
    registry.registerDynamic(sessionId, [
      { name: 'Coach', persona: 'Gives tips', canvasType: 'explain-it' },
    ]);

    const spec: NuggetSpec = {
      nugget: { goal: 'test' },
      meeting_team: [{ type: 'custom', name: 'Coach' }], // no meetingTypeId
    };
    wiring.setSpec(sessionId, spec);

    // explain-it trigger fires at 40%+ completion
    await wiring.evaluateAndInvite(
      'task_completed',
      { tasks_done: 2, tasks_total: 4 },
      sessionId, send, 'explorer',
    );

    const inviteCalls = send.mock.calls.filter(
      (c: unknown[]) => (c[0] as { type: string }).type === 'meeting_invite',
    );
    const invitedIds = inviteCalls.map((c: unknown[]) => (c[0] as { meetingTypeId: string }).meetingTypeId);
    // Only always-on agents should fire, not the custom one
    expect(invitedIds).not.toContain('custom-test-session-0');
  });

  it('clearSession removes spec and dedup state', async () => {
    const spec: NuggetSpec = {
      nugget: { goal: 'test' },
      meeting_team: [{ type: 'builtin', meetingTypeId: 'media-agent' }],
    };
    wiring.setSpec(sessionId, spec);

    await wiring.evaluateAndInvite(
      'task_completed',
      { tasks_done: 1, tasks_total: 4 },
      sessionId, send, 'explorer',
    );

    wiring.clearSession(sessionId);

    // After clear, re-setting spec and evaluating should work again
    send.mockReset();
    wiring.setSpec(sessionId, spec);
    await wiring.evaluateAndInvite(
      'task_completed',
      { tasks_done: 2, tasks_total: 4 },
      sessionId, send, 'explorer',
    );

    const inviteCalls = send.mock.calls.filter(
      (c: unknown[]) => (c[0] as { type: string }).type === 'meeting_invite',
    );
    expect(inviteCalls.length).toBeGreaterThan(0);
  });
});
