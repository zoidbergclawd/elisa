import { describe, it, expect } from 'vitest';
import { MeetingRegistry, MeetingTriggerEngine } from '../services/meetingRegistry.js';
import { WEB_DESIGN_AGENT_MEETING, registerWebDesignAgentMeeting } from '../services/webDesignAgentMeeting.js';

describe('WEB_DESIGN_AGENT_MEETING', () => {
  it('has the correct id, name, agentName, and canvasType', () => {
    expect(WEB_DESIGN_AGENT_MEETING.id).toBe('web-design-agent');
    expect(WEB_DESIGN_AGENT_MEETING.name).toBe('Web Designer Agent');
    expect(WEB_DESIGN_AGENT_MEETING.agentName).toBe('Styler');
    expect(WEB_DESIGN_AGENT_MEETING.canvasType).toBe('default');
  });

  it('has a persona string', () => {
    expect(WEB_DESIGN_AGENT_MEETING.persona).toBeTruthy();
    expect(typeof WEB_DESIGN_AGENT_MEETING.persona).toBe('string');
  });
});

describe('registerWebDesignAgentMeeting', () => {
  it('registers the web-design-agent meeting type in the registry', () => {
    const registry = new MeetingRegistry();
    registerWebDesignAgentMeeting(registry);

    const mt = registry.getById('web-design-agent');
    expect(mt).toBeDefined();
    expect(mt!.id).toBe('web-design-agent');
    expect(mt!.canvasType).toBe('default');
  });
});

describe('Web Design Agent trigger conditions', () => {
  it('matches deploy_started with target web', () => {
    const registry = new MeetingRegistry();
    registerWebDesignAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('deploy_started', { target: 'web' });
    expect(matches).toHaveLength(1);
    expect(matches[0].meetingType.id).toBe('web-design-agent');
  });

  it('does not match deploy_started with non-web target', () => {
    const registry = new MeetingRegistry();
    registerWebDesignAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('deploy_started', { target: 'device' });
    expect(matches).toHaveLength(0);
  });

  it('does not match deploy_started with no target', () => {
    const registry = new MeetingRegistry();
    registerWebDesignAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('deploy_started', {});
    expect(matches).toHaveLength(0);
  });

  it('does not match non-deploy events even with web target', () => {
    const registry = new MeetingRegistry();
    registerWebDesignAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    expect(engine.evaluate('session_complete', { target: 'web' })).toHaveLength(0);
    expect(engine.evaluate('task_completed', { target: 'web' })).toHaveLength(0);
  });
});
