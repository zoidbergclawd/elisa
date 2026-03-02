import { describe, it, expect } from 'vitest';
import { MeetingRegistry, MeetingTriggerEngine } from '../services/meetingRegistry.js';
import { WEB_DESIGN_AGENT_MEETING, registerWebDesignAgentMeeting } from '../services/webDesignAgentMeeting.js';

describe('WEB_DESIGN_AGENT_MEETING', () => {
  it('has the correct id, name, agentName, and canvasType', () => {
    expect(WEB_DESIGN_AGENT_MEETING.id).toBe('web-design-agent');
    expect(WEB_DESIGN_AGENT_MEETING.name).toBe('Web Designer Agent');
    expect(WEB_DESIGN_AGENT_MEETING.agentName).toBe('Styler');
    expect(WEB_DESIGN_AGENT_MEETING.canvasType).toBe('launch-pad');
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
    expect(mt!.canvasType).toBe('launch-pad');
  });
});

describe('Web Design Agent trigger conditions', () => {
  it('matches task_completed at 60% with web target (3 of 5 tasks)', () => {
    const registry = new MeetingRegistry();
    registerWebDesignAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('task_completed', {
      tasks_done: 3,
      tasks_total: 5,
      deploy_target: 'web',
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].meetingType.id).toBe('web-design-agent');
  });

  it('matches task_completed above 60% with web target (4 of 5 tasks)', () => {
    const registry = new MeetingRegistry();
    registerWebDesignAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('task_completed', {
      tasks_done: 4,
      tasks_total: 5,
      deploy_target: 'web',
    });
    expect(matches).toHaveLength(1);
  });

  it('does not match task_completed below 60% with web target (2 of 5 tasks)', () => {
    const registry = new MeetingRegistry();
    registerWebDesignAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('task_completed', {
      tasks_done: 2,
      tasks_total: 5,
      deploy_target: 'web',
    });
    expect(matches).toHaveLength(0);
  });

  it('does not match task_completed at 60% with non-web target', () => {
    const registry = new MeetingRegistry();
    registerWebDesignAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('task_completed', {
      tasks_done: 3,
      tasks_total: 5,
      deploy_target: 'esp32',
    });
    expect(matches).toHaveLength(0);
  });

  it('does not match task_completed at 60% with no target', () => {
    const registry = new MeetingRegistry();
    registerWebDesignAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('task_completed', {
      tasks_done: 3,
      tasks_total: 5,
    });
    expect(matches).toHaveLength(0);
  });

  it('does not match deploy_started even with web target', () => {
    const registry = new MeetingRegistry();
    registerWebDesignAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('deploy_started', { target: 'web' });
    expect(matches).toHaveLength(0);
  });

  it('does not match plan_ready or session_complete', () => {
    const registry = new MeetingRegistry();
    registerWebDesignAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    expect(engine.evaluate('plan_ready', {})).toHaveLength(0);
    expect(engine.evaluate('session_complete', {})).toHaveLength(0);
  });
});
