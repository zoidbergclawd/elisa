import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeetingService } from './meetingService.js';
import { MeetingRegistry } from './meetingRegistry.js';
import type { MeetingType } from '../models/meeting.js';
import type { MeetingBuildContext } from './meetingAgentService.js';
import type { SendEvent } from './phases/types.js';

const testMeetingType: MeetingType = {
  id: 'test-meeting',
  name: 'Test Meeting',
  agentName: 'TestBot',
  canvasType: 'blueprint',
  triggerConditions: [{ event: 'plan_ready' }],
  persona: 'A friendly test bot.',
};

const themeMeetingType: MeetingType = {
  id: 'theme-meeting',
  name: 'Theme Meeting',
  agentName: 'Pixel',
  canvasType: 'theme-picker',
  triggerConditions: [{ event: 'deploy_started' }],
  persona: 'An art agent.',
};

const buildContext: MeetingBuildContext = {
  goal: 'Build a weather app',
  requirements: ['Show temperature'],
  tasks: [
    { id: 't1', title: 'Create UI', agent: 'Builder', status: 'done' },
    { id: 't2', title: 'Add API', agent: 'Builder', status: 'pending' },
  ],
  agents: [{ name: 'Builder', role: 'builder' }],
  devices: [],
  phase: 'executing',
};

describe('MeetingService', () => {
  let registry: MeetingRegistry;
  let service: MeetingService;
  let send: SendEvent;
  let sentEvents: unknown[];

  beforeEach(() => {
    registry = new MeetingRegistry();
    registry.register(testMeetingType);
    registry.register(themeMeetingType);
    service = new MeetingService(registry);
    sentEvents = [];
    send = vi.fn(async (event: unknown) => { sentEvents.push(event); });
  });

  describe('getMeetingType', () => {
    it('returns registered meeting type by ID', () => {
      expect(service.getMeetingType('test-meeting')).toEqual(testMeetingType);
    });

    it('returns undefined for unknown ID', () => {
      expect(service.getMeetingType('nonexistent')).toBeUndefined();
    });
  });

  describe('acceptMeeting with build context', () => {
    it('pre-populates blueprint canvas with build data', async () => {
      const invite = await service.createInvite('test-meeting', 'session-1', send);
      expect(invite).not.toBeNull();

      const result = await service.acceptMeeting(invite!.id, send, buildContext);
      expect(result).not.toBeNull();
      expect(result!.canvas.data).toMatchObject({
        tasks: buildContext.tasks,
        requirements: buildContext.requirements,
        total_tasks: 2,
        tasks_done: 1,
      });
    });

    it('pre-populates theme-picker canvas with currentTheme', async () => {
      const invite = await service.createInvite('theme-meeting', 'session-1', send);
      expect(invite).not.toBeNull();

      const result = await service.acceptMeeting(invite!.id, send, buildContext);
      expect(result).not.toBeNull();
      expect(result!.canvas.data).toHaveProperty('currentTheme');
    });

    it('emits meeting_canvas_update when canvas is pre-populated', async () => {
      const invite = await service.createInvite('test-meeting', 'session-1', send);
      sentEvents = [];

      await service.acceptMeeting(invite!.id, send, buildContext);

      const canvasEvent = sentEvents.find(
        (e: any) => e.type === 'meeting_canvas_update',
      ) as any;
      expect(canvasEvent).toBeDefined();
      expect(canvasEvent.data.total_tasks).toBe(2);
    });

    it('works without build context (backward compat)', async () => {
      const invite = await service.createInvite('test-meeting', 'session-1', send);
      const result = await service.acceptMeeting(invite!.id, send);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('active');
      expect(Object.keys(result!.canvas.data)).toHaveLength(0);
    });

    it('sends greeting message on accept', async () => {
      const invite = await service.createInvite('test-meeting', 'session-1', send);
      sentEvents = [];

      const result = await service.acceptMeeting(invite!.id, send, buildContext);
      expect(result!.messages.length).toBeGreaterThanOrEqual(1);
      expect(result!.messages[0].role).toBe('agent');

      const greetingEvent = sentEvents.find(
        (e: any) => e.type === 'meeting_message' && e.role === 'agent',
      );
      expect(greetingEvent).toBeDefined();
    });
  });
});
