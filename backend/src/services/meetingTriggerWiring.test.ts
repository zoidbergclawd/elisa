/** Unit tests for MeetingTriggerWiring. */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MeetingTriggerWiring } from './meetingTriggerWiring.js';
import { MeetingRegistry } from './meetingRegistry.js';
import { MeetingService } from './meetingService.js';
import type { MeetingType } from '../models/meeting.js';
import type { SendEvent } from './phases/types.js';

function makeSend(): SendEvent {
  return vi.fn().mockResolvedValue(undefined);
}

function makeDeployMeeting(id: string, event: string, filter?: (data: Record<string, unknown>) => boolean): MeetingType {
  return {
    id,
    name: `Meeting ${id}`,
    agentName: `Agent ${id}`,
    canvasType: 'default',
    triggerConditions: [{ event, filter }],
    persona: `Persona for ${id}`,
  };
}

describe('MeetingTriggerWiring', () => {
  let registry: MeetingRegistry;
  let meetingService: MeetingService;
  let wiring: MeetingTriggerWiring;

  beforeEach(() => {
    registry = new MeetingRegistry();
    meetingService = new MeetingService(registry);
    wiring = new MeetingTriggerWiring(registry, meetingService);
  });

  it('creates invites for matching deploy_started events at explorer level', async () => {
    const webMeeting = makeDeployMeeting('web-design', 'deploy_started', (data) => data.target === 'web');
    registry.register(webMeeting);

    const send = makeSend();
    await wiring.evaluateAndInvite('deploy_started', { target: 'web' }, 'session-1', send, 'explorer');

    // meetingService.createInvite sends a meeting_invite event
    const invites = vi.mocked(send).mock.calls.filter(([ev]) => ev.type === 'meeting_invite');
    expect(invites).toHaveLength(1);
    expect(invites[0][0]).toMatchObject({
      type: 'meeting_invite',
      meetingTypeId: 'web-design',
      agentName: 'Agent web-design',
    });
  });

  it('does not create invites when event does not match filter', async () => {
    const webMeeting = makeDeployMeeting('web-design', 'deploy_started', (data) => data.target === 'web');
    registry.register(webMeeting);

    const send = makeSend();
    await wiring.evaluateAndInvite('deploy_started', { target: 'devices' }, 'session-1', send, 'explorer');

    const invites = vi.mocked(send).mock.calls.filter(([ev]) => ev.type === 'meeting_invite');
    expect(invites).toHaveLength(0);
  });

  it('creates invites at builder level (auto-invite enabled at all levels)', async () => {
    const meeting = makeDeployMeeting('doc-agent', 'session_complete');
    registry.register(meeting);

    const send = makeSend();
    await wiring.evaluateAndInvite('session_complete', {}, 'session-1', send, 'builder');

    const invites = vi.mocked(send).mock.calls.filter(([ev]) => ev.type === 'meeting_invite');
    expect(invites).toHaveLength(1);
  });

  it('creates invites at architect level (auto-invite enabled at all levels)', async () => {
    const meeting = makeDeployMeeting('doc-agent', 'session_complete');
    registry.register(meeting);

    const send = makeSend();
    await wiring.evaluateAndInvite('session_complete', {}, 'session-1', send, 'architect');

    const invites = vi.mocked(send).mock.calls.filter(([ev]) => ev.type === 'meeting_invite');
    expect(invites).toHaveLength(1);
  });

  it('creates invites for session_complete events at explorer level', async () => {
    const docMeeting = makeDeployMeeting('doc-agent', 'session_complete');
    const archMeeting = makeDeployMeeting('arch-agent', 'session_complete');
    registry.register(docMeeting);
    registry.register(archMeeting);

    const send = makeSend();
    await wiring.evaluateAndInvite('session_complete', { tasks_done: 5, tasks_total: 5 }, 'session-1', send, 'explorer');

    const invites = vi.mocked(send).mock.calls.filter(([ev]) => ev.type === 'meeting_invite');
    expect(invites).toHaveLength(2);
    const typeIds = invites.map(([ev]) => (ev as any).meetingTypeId);
    expect(typeIds).toContain('doc-agent');
    expect(typeIds).toContain('arch-agent');
  });

  it('creates invites for composition_started events at explorer level', async () => {
    const integrationMeeting = makeDeployMeeting('integration-agent', 'composition_started');
    registry.register(integrationMeeting);

    const send = makeSend();
    await wiring.evaluateAndInvite('composition_started', { graph_id: 'g1', node_ids: ['n1', 'n2'] }, 'session-1', send, 'explorer');

    const invites = vi.mocked(send).mock.calls.filter(([ev]) => ev.type === 'meeting_invite');
    expect(invites).toHaveLength(1);
    expect(invites[0][0]).toMatchObject({
      type: 'meeting_invite',
      meetingTypeId: 'integration-agent',
    });
  });

  it('handles no registered meeting types gracefully', async () => {
    const send = makeSend();
    await wiring.evaluateAndInvite('deploy_started', { target: 'web' }, 'session-1', send, 'explorer');

    expect(send).not.toHaveBeenCalled();
  });

  it('triggers multiple meeting types for the same event', async () => {
    const meeting1 = makeDeployMeeting('meeting-a', 'deploy_started');
    const meeting2 = makeDeployMeeting('meeting-b', 'deploy_started');
    registry.register(meeting1);
    registry.register(meeting2);

    const send = makeSend();
    await wiring.evaluateAndInvite('deploy_started', { target: 'web' }, 'session-1', send, 'explorer');

    const invites = vi.mocked(send).mock.calls.filter(([ev]) => ev.type === 'meeting_invite');
    expect(invites).toHaveLength(2);
  });

  it('deduplicates: does not create a second invite for the same meeting type in the same session', async () => {
    const meeting = makeDeployMeeting('media-agent', 'task_completed', (data) => {
      return ((data.tasks_done as number) ?? 0) >= 1;
    });
    registry.register(meeting);

    const send = makeSend();
    // First call: tasks_done=1, should create invite
    await wiring.evaluateAndInvite('task_completed', { tasks_done: 1, tasks_total: 4 }, 'session-1', send, 'explorer');
    // Second call: tasks_done=2, filter still matches but should be deduped
    await wiring.evaluateAndInvite('task_completed', { tasks_done: 2, tasks_total: 4 }, 'session-1', send, 'explorer');
    // Third call: tasks_done=3, still deduped
    await wiring.evaluateAndInvite('task_completed', { tasks_done: 3, tasks_total: 4 }, 'session-1', send, 'explorer');

    const invites = vi.mocked(send).mock.calls.filter(([ev]) => ev.type === 'meeting_invite');
    expect(invites).toHaveLength(1);
  });

  it('dedup is per-session: different sessions get their own invites', async () => {
    const meeting = makeDeployMeeting('media-agent', 'task_completed');
    registry.register(meeting);

    const send = makeSend();
    await wiring.evaluateAndInvite('task_completed', { tasks_done: 1, tasks_total: 4 }, 'session-1', send, 'explorer');
    await wiring.evaluateAndInvite('task_completed', { tasks_done: 1, tasks_total: 4 }, 'session-2', send, 'explorer');

    const invites = vi.mocked(send).mock.calls.filter(([ev]) => ev.type === 'meeting_invite');
    expect(invites).toHaveLength(2);
  });

  it('clearSession removes dedup state for that session', async () => {
    const meeting = makeDeployMeeting('media-agent', 'task_completed');
    registry.register(meeting);

    const send = makeSend();
    await wiring.evaluateAndInvite('task_completed', { tasks_done: 1, tasks_total: 4 }, 'session-1', send, 'explorer');

    wiring.clearSession('session-1');

    // After clearing, same meeting type can be invited again
    await wiring.evaluateAndInvite('task_completed', { tasks_done: 2, tasks_total: 4 }, 'session-1', send, 'explorer');

    const invites = vi.mocked(send).mock.calls.filter(([ev]) => ev.type === 'meeting_invite');
    expect(invites).toHaveLength(2);
  });
});
