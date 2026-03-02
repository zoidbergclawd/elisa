import { describe, it, expect } from 'vitest';
import { MeetingRegistry, MeetingTriggerEngine } from '../services/meetingRegistry.js';
import { MEDIA_AGENT_MEETING, registerMediaAgentMeeting } from '../services/mediaAgentMeeting.js';

describe('MEDIA_AGENT_MEETING', () => {
  it('has the correct id, name, agentName, and canvasType', () => {
    expect(MEDIA_AGENT_MEETING.id).toBe('media-agent');
    expect(MEDIA_AGENT_MEETING.name).toBe('Media Agent');
    expect(MEDIA_AGENT_MEETING.agentName).toBe('Canvas');
    expect(MEDIA_AGENT_MEETING.canvasType).toBe('campaign');
  });

  it('has a persona string', () => {
    expect(MEDIA_AGENT_MEETING.persona).toBeTruthy();
    expect(typeof MEDIA_AGENT_MEETING.persona).toBe('string');
  });
});

describe('registerMediaAgentMeeting', () => {
  it('registers the media-agent meeting type in the registry', () => {
    const registry = new MeetingRegistry();
    registerMediaAgentMeeting(registry);

    const mt = registry.getById('media-agent');
    expect(mt).toBeDefined();
    expect(mt!.id).toBe('media-agent');
    expect(mt!.canvasType).toBe('campaign');
  });
});

describe('Media Agent trigger conditions', () => {
  it('matches task_completed at 25% progress (1 of 4 tasks)', () => {
    const registry = new MeetingRegistry();
    registerMediaAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('task_completed', { tasks_done: 1, tasks_total: 4 });
    expect(matches).toHaveLength(1);
    expect(matches[0].meetingType.id).toBe('media-agent');
  });

  it('matches task_completed above 25% progress (3 of 4 tasks)', () => {
    const registry = new MeetingRegistry();
    registerMediaAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('task_completed', { tasks_done: 3, tasks_total: 4 });
    expect(matches).toHaveLength(1);
  });

  it('does not match task_completed below 25% progress (0 of 4 tasks)', () => {
    const registry = new MeetingRegistry();
    registerMediaAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('task_completed', { tasks_done: 0, tasks_total: 4 });
    expect(matches).toHaveLength(0);
  });

  it('matches with a single task (1 of 1 is 100%)', () => {
    const registry = new MeetingRegistry();
    registerMediaAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('task_completed', { tasks_done: 1, tasks_total: 1 });
    expect(matches).toHaveLength(1);
  });

  it('does not match plan_ready', () => {
    const registry = new MeetingRegistry();
    registerMediaAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    expect(engine.evaluate('plan_ready', {})).toHaveLength(0);
  });

  it('does not match deploy_started or session_complete', () => {
    const registry = new MeetingRegistry();
    registerMediaAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    expect(engine.evaluate('deploy_started', {})).toHaveLength(0);
    expect(engine.evaluate('session_complete', {})).toHaveLength(0);
  });
});
