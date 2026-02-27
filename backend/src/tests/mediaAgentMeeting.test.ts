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
  it('matches session_complete event', () => {
    const registry = new MeetingRegistry();
    registerMediaAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('session_complete', {});
    expect(matches).toHaveLength(1);
    expect(matches[0].meetingType.id).toBe('media-agent');
  });

  it('does not match non-session_complete events', () => {
    const registry = new MeetingRegistry();
    registerMediaAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    expect(engine.evaluate('deploy_started', {})).toHaveLength(0);
    expect(engine.evaluate('task_completed', {})).toHaveLength(0);
    expect(engine.evaluate('task_started', {})).toHaveLength(0);
  });
});
