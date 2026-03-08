import { describe, it, expect } from 'vitest';
import { MeetingRegistry, MeetingTriggerEngine } from '../services/meetingRegistry.js';
import { SOCIAL_MEDIA_AGENT_MEETING, registerSocialMediaAgentMeeting } from '../services/socialMediaAgentMeeting.js';

describe('SOCIAL_MEDIA_AGENT_MEETING', () => {
  it('has the correct id, name, agentName, and canvasType', () => {
    expect(SOCIAL_MEDIA_AGENT_MEETING.id).toBe('social-media-agent');
    expect(SOCIAL_MEDIA_AGENT_MEETING.name).toBe('Social Media Agent');
    expect(SOCIAL_MEDIA_AGENT_MEETING.agentName).toBe('Social Media');
    expect(SOCIAL_MEDIA_AGENT_MEETING.canvasType).toBe('campaign');
  });

  it('has a persona string', () => {
    expect(SOCIAL_MEDIA_AGENT_MEETING.persona).toBeTruthy();
    expect(typeof SOCIAL_MEDIA_AGENT_MEETING.persona).toBe('string');
  });
});

describe('registerSocialMediaAgentMeeting', () => {
  it('registers the social-media-agent meeting type in the registry', () => {
    const registry = new MeetingRegistry();
    registerSocialMediaAgentMeeting(registry);

    const mt = registry.getById('social-media-agent');
    expect(mt).toBeDefined();
    expect(mt!.id).toBe('social-media-agent');
    expect(mt!.canvasType).toBe('campaign');
  });
});

describe('Social Media Agent trigger conditions', () => {
  it('matches task_completed at 50% progress (2 of 4 tasks)', () => {
    const registry = new MeetingRegistry();
    registerSocialMediaAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('task_completed', { tasks_done: 2, tasks_total: 4 });
    expect(matches).toHaveLength(1);
    expect(matches[0].meetingType.id).toBe('social-media-agent');
  });

  it('matches task_completed above 50% progress (3 of 4 tasks)', () => {
    const registry = new MeetingRegistry();
    registerSocialMediaAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('task_completed', { tasks_done: 3, tasks_total: 4 });
    expect(matches).toHaveLength(1);
  });

  it('does not match task_completed below 50% progress (1 of 4 tasks)', () => {
    const registry = new MeetingRegistry();
    registerSocialMediaAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('task_completed', { tasks_done: 1, tasks_total: 4 });
    expect(matches).toHaveLength(0);
  });

  it('does not match deploy_started', () => {
    const registry = new MeetingRegistry();
    registerSocialMediaAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    expect(engine.evaluate('deploy_started', {})).toHaveLength(0);
  });

  it('does not match plan_ready or session_complete', () => {
    const registry = new MeetingRegistry();
    registerSocialMediaAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    expect(engine.evaluate('plan_ready', {})).toHaveLength(0);
    expect(engine.evaluate('session_complete', {})).toHaveLength(0);
  });
});
