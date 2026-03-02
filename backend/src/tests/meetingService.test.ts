import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeetingRegistry } from '../services/meetingRegistry.js';
import { MeetingService } from '../services/meetingService.js';
import type { MeetingType } from '../models/meeting.js';
import type { SendEvent } from '../services/phases/types.js';

function makeMeetingType(overrides?: Partial<MeetingType>): MeetingType {
  return {
    id: 'test-meeting',
    name: 'Test Meeting',
    agentName: 'Pixel',
    canvasType: 'test-canvas',
    triggerConditions: [],
    persona: 'A friendly test agent who helps debug',
    ...overrides,
  };
}

describe('MeetingService', () => {
  let registry: MeetingRegistry;
  let service: MeetingService;
  let send: SendEvent;
  let sentEvents: Record<string, any>[];

  beforeEach(() => {
    registry = new MeetingRegistry();
    registry.register(makeMeetingType());
    service = new MeetingService(registry);
    sentEvents = [];
    send = vi.fn(async (event) => {
      sentEvents.push(event as Record<string, any>);
    }) as unknown as SendEvent;
  });

  describe('createInvite', () => {
    it('creates a meeting invite and sends meeting_invite event', async () => {
      const meeting = await service.createInvite('test-meeting', 'session-1', send);
      expect(meeting).not.toBeNull();
      expect(meeting!.status).toBe('invited');
      expect(meeting!.meetingTypeId).toBe('test-meeting');
      expect(meeting!.sessionId).toBe('session-1');
      expect(meeting!.agentName).toBe('Pixel');

      expect(sentEvents).toHaveLength(1);
      expect(sentEvents[0].type).toBe('meeting_invite');
      expect(sentEvents[0].meetingId).toBe(meeting!.id);
      expect(sentEvents[0].agentName).toBe('Pixel');
    });

    it('returns null for unknown meeting type', async () => {
      const result = await service.createInvite('unknown', 'session-1', send);
      expect(result).toBeNull();
      expect(sentEvents).toHaveLength(0);
    });

    it('supports title and description overrides', async () => {
      const meeting = await service.createInvite('test-meeting', 'session-1', send, {
        title: 'Custom Title',
        description: 'Custom description',
      });
      expect(meeting!.title).toBe('Custom Title');
      expect(meeting!.description).toBe('Custom description');
    });

    it('stores focusContext when provided', async () => {
      const meeting = await service.createInvite('test-meeting', 'session-1', send, {
        focusContext: 'Task: Implement spaceship\nDescription: Create the spaceship sprite',
      });
      expect(meeting!.focusContext).toBe('Task: Implement spaceship\nDescription: Create the spaceship sprite');
    });

    it('omits focusContext when not provided', async () => {
      const meeting = await service.createInvite('test-meeting', 'session-1', send);
      expect(meeting!.focusContext).toBeUndefined();
    });
  });

  describe('acceptMeeting', () => {
    it('transitions from invited to active and sends meeting_started event', async () => {
      const meeting = await service.createInvite('test-meeting', 'session-1', send);
      sentEvents = [];

      const accepted = await service.acceptMeeting(meeting!.id, send);
      expect(accepted).not.toBeNull();
      expect(accepted!.status).toBe('active');

      // Should send meeting_started + greeting message
      expect(sentEvents.length).toBeGreaterThanOrEqual(1);
      expect(sentEvents[0].type).toBe('meeting_started');
      expect(sentEvents[0].meetingId).toBe(meeting!.id);
      expect(sentEvents[0].canvasType).toBe('test-canvas');
    });

    it('sends an agent greeting message', async () => {
      const meeting = await service.createInvite('test-meeting', 'session-1', send);
      sentEvents = [];

      await service.acceptMeeting(meeting!.id, send);

      const greetingEvent = sentEvents.find(e => e.type === 'meeting_message');
      expect(greetingEvent).toBeDefined();
      expect(greetingEvent!.role).toBe('agent');
      expect(greetingEvent!.content).toContain('Pixel');
    });

    it('returns null for unknown meeting ID', async () => {
      const result = await service.acceptMeeting('unknown', send);
      expect(result).toBeNull();
    });

    it('returns null if meeting is not in invited state', async () => {
      const meeting = await service.createInvite('test-meeting', 'session-1', send);
      await service.acceptMeeting(meeting!.id, send);
      sentEvents = [];

      // Try to accept again
      const result = await service.acceptMeeting(meeting!.id, send);
      expect(result).toBeNull();
      expect(sentEvents).toHaveLength(0);
    });
  });

  describe('declineMeeting', () => {
    it('transitions from invited to declined', async () => {
      const meeting = await service.createInvite('test-meeting', 'session-1', send);
      const declined = service.declineMeeting(meeting!.id);
      expect(declined).not.toBeNull();
      expect(declined!.status).toBe('declined');
    });

    it('returns null if not in invited state', async () => {
      const meeting = await service.createInvite('test-meeting', 'session-1', send);
      await service.acceptMeeting(meeting!.id, send);

      const result = service.declineMeeting(meeting!.id);
      expect(result).toBeNull();
    });

    it('returns null for unknown meeting', () => {
      expect(service.declineMeeting('unknown')).toBeNull();
    });
  });

  describe('sendMessage', () => {
    it('adds a message and sends meeting_message event', async () => {
      const meeting = await service.createInvite('test-meeting', 'session-1', send);
      await service.acceptMeeting(meeting!.id, send);
      sentEvents = [];

      const msg = await service.sendMessage(meeting!.id, 'kid', 'Hello!', send);
      expect(msg).not.toBeNull();
      expect(msg!.role).toBe('kid');
      expect(msg!.content).toBe('Hello!');

      expect(sentEvents).toHaveLength(1);
      expect(sentEvents[0].type).toBe('meeting_message');
      expect(sentEvents[0].role).toBe('kid');
      expect(sentEvents[0].content).toBe('Hello!');
    });

    it('returns null if meeting is not active', async () => {
      const meeting = await service.createInvite('test-meeting', 'session-1', send);
      const result = await service.sendMessage(meeting!.id, 'kid', 'Hello!', send);
      expect(result).toBeNull();
    });

    it('returns null for unknown meeting', async () => {
      const result = await service.sendMessage('unknown', 'kid', 'Hello!', send);
      expect(result).toBeNull();
    });
  });

  describe('updateCanvas', () => {
    it('updates canvas state and sends meeting_canvas_update event', async () => {
      const meeting = await service.createInvite('test-meeting', 'session-1', send);
      await service.acceptMeeting(meeting!.id, send);
      sentEvents = [];

      const canvas = await service.updateCanvas(meeting!.id, { selected: 'tool-1' }, send);
      expect(canvas).not.toBeNull();
      expect(canvas!.data).toEqual({ selected: 'tool-1' });

      expect(sentEvents).toHaveLength(1);
      expect(sentEvents[0].type).toBe('meeting_canvas_update');
    });

    it('merges canvas data', async () => {
      const meeting = await service.createInvite('test-meeting', 'session-1', send);
      await service.acceptMeeting(meeting!.id, send);

      await service.updateCanvas(meeting!.id, { a: 1 }, send);
      const canvas = await service.updateCanvas(meeting!.id, { b: 2 }, send);
      expect(canvas!.data).toEqual({ a: 1, b: 2 });
    });

    it('returns null for inactive meeting', async () => {
      const meeting = await service.createInvite('test-meeting', 'session-1', send);
      const result = await service.updateCanvas(meeting!.id, {}, send);
      expect(result).toBeNull();
    });
  });

  describe('addOutcome', () => {
    it('adds outcome and sends meeting_outcome event', async () => {
      const meeting = await service.createInvite('test-meeting', 'session-1', send);
      await service.acceptMeeting(meeting!.id, send);
      sentEvents = [];

      const outcome = await service.addOutcome(
        meeting!.id,
        'fix_task',
        { file: 'app.py', line: 42 },
        send,
      );
      expect(outcome).not.toBeNull();
      expect(outcome!.type).toBe('fix_task');
      expect(outcome!.data).toEqual({ file: 'app.py', line: 42 });

      expect(sentEvents).toHaveLength(1);
      expect(sentEvents[0].type).toBe('meeting_outcome');
      expect(sentEvents[0].outcomeType).toBe('fix_task');
    });

    it('returns null for inactive meeting', async () => {
      const meeting = await service.createInvite('test-meeting', 'session-1', send);
      const result = await service.addOutcome(meeting!.id, 'fix', {}, send);
      expect(result).toBeNull();
    });
  });

  describe('endMeeting', () => {
    it('transitions to completed and sends meeting_ended event', async () => {
      const meeting = await service.createInvite('test-meeting', 'session-1', send);
      await service.acceptMeeting(meeting!.id, send);
      await service.addOutcome(meeting!.id, 'fix', { file: 'x.py' }, send);
      sentEvents = [];

      const ended = await service.endMeeting(meeting!.id, send);
      expect(ended).not.toBeNull();
      expect(ended!.status).toBe('completed');

      expect(sentEvents).toHaveLength(1);
      expect(sentEvents[0].type).toBe('meeting_ended');
      expect(sentEvents[0].outcomes).toHaveLength(1);
      expect(sentEvents[0].outcomes[0].type).toBe('fix');
    });

    it('returns null if meeting is not active', async () => {
      const meeting = await service.createInvite('test-meeting', 'session-1', send);
      const result = await service.endMeeting(meeting!.id, send);
      expect(result).toBeNull();
    });
  });

  describe('full lifecycle', () => {
    it('invite -> accept -> message -> outcome -> end', async () => {
      // Invite
      const meeting = await service.createInvite('test-meeting', 'session-1', send);
      expect(meeting!.status).toBe('invited');

      // Accept
      const accepted = await service.acceptMeeting(meeting!.id, send);
      expect(accepted!.status).toBe('active');

      // Messages
      await service.sendMessage(meeting!.id, 'kid', 'What is wrong?', send);
      await service.sendMessage(meeting!.id, 'agent', 'The test is failing on line 5.', send);

      // Check messages accumulated (greeting + 2 messages)
      const current = service.getMeeting(meeting!.id)!;
      expect(current.messages.length).toBeGreaterThanOrEqual(3);

      // Outcome
      await service.addOutcome(meeting!.id, 'fix_task', { line: 5 }, send);

      // End
      const ended = await service.endMeeting(meeting!.id, send);
      expect(ended!.status).toBe('completed');
      expect(ended!.outcomes).toHaveLength(1);
    });
  });

  describe('session queries', () => {
    it('getMeetingsForSession returns all meetings for a session', async () => {
      await service.createInvite('test-meeting', 'session-1', send);
      await service.createInvite('test-meeting', 'session-1', send);
      await service.createInvite('test-meeting', 'session-2', send);

      expect(service.getMeetingsForSession('session-1')).toHaveLength(2);
      expect(service.getMeetingsForSession('session-2')).toHaveLength(1);
      expect(service.getMeetingsForSession('session-3')).toHaveLength(0);
    });

    it('getActiveMeetings returns only active meetings', async () => {
      const m1 = await service.createInvite('test-meeting', 'session-1', send);
      const m2 = await service.createInvite('test-meeting', 'session-1', send);
      await service.acceptMeeting(m1!.id, send);

      const active = service.getActiveMeetings('session-1');
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(m1!.id);
    });

    it('getMeetingHistory returns completed and declined meetings', async () => {
      const m1 = await service.createInvite('test-meeting', 'session-1', send);
      const m2 = await service.createInvite('test-meeting', 'session-1', send);
      const m3 = await service.createInvite('test-meeting', 'session-1', send);

      await service.acceptMeeting(m1!.id, send);
      await service.endMeeting(m1!.id, send);
      service.declineMeeting(m2!.id);

      const history = service.getMeetingHistory('session-1');
      expect(history).toHaveLength(2);
      expect(history.map(m => m.status)).toEqual(expect.arrayContaining(['completed', 'declined']));
    });
  });

  describe('cleanupSession', () => {
    it('removes all meetings for a session', async () => {
      await service.createInvite('test-meeting', 'session-1', send);
      await service.createInvite('test-meeting', 'session-1', send);
      await service.createInvite('test-meeting', 'session-2', send);

      await service.cleanupSession('session-1');
      expect(service.getMeetingsForSession('session-1')).toHaveLength(0);
      expect(service.getMeetingsForSession('session-2')).toHaveLength(1);
    });

    it('is a no-op for unknown session', async () => {
      await service.cleanupSession('unknown');
      // Should not throw
    });

    it('sends meeting_ended events for invited meetings when send is provided', async () => {
      await service.createInvite('test-meeting', 'session-1', send);
      await service.createInvite('test-meeting', 'session-1', send);
      sentEvents = [];

      await service.cleanupSession('session-1', send);
      const endedEvents = sentEvents.filter(e => e.type === 'meeting_ended');
      expect(endedEvents).toHaveLength(2);
    });

    it('sends meeting_ended events for active meetings when send is provided', async () => {
      const meeting = await service.createInvite('test-meeting', 'session-1', send);
      await service.acceptMeeting(meeting!.id, send);
      sentEvents = [];

      await service.cleanupSession('session-1', send);
      const endedEvents = sentEvents.filter(e => e.type === 'meeting_ended');
      expect(endedEvents).toHaveLength(1);
    });

    it('does not send events for already-completed meetings', async () => {
      const meeting = await service.createInvite('test-meeting', 'session-1', send);
      await service.acceptMeeting(meeting!.id, send);
      await service.endMeeting(meeting!.id, send);
      sentEvents = [];

      await service.cleanupSession('session-1', send);
      const endedEvents = sentEvents.filter(e => e.type === 'meeting_ended');
      expect(endedEvents).toHaveLength(0);
    });

    it('does not send events when no send function is provided', async () => {
      await service.createInvite('test-meeting', 'session-1', send);
      sentEvents = [];

      await service.cleanupSession('session-1');
      expect(sentEvents).toHaveLength(0);
      expect(service.getMeetingsForSession('session-1')).toHaveLength(0);
    });
  });
});
