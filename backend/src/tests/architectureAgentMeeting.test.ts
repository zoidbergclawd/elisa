import { describe, it, expect } from 'vitest';
import { MeetingRegistry, MeetingTriggerEngine } from '../services/meetingRegistry.js';
import { ARCHITECTURE_AGENT_MEETING, registerArchitectureAgentMeeting } from '../services/architectureAgentMeeting.js';

describe('ARCHITECTURE_AGENT_MEETING', () => {
  it('has the correct id, name, agentName, and canvasType', () => {
    expect(ARCHITECTURE_AGENT_MEETING.id).toBe('architecture-agent');
    expect(ARCHITECTURE_AGENT_MEETING.name).toBe('Architecture Agent');
    expect(ARCHITECTURE_AGENT_MEETING.agentName).toBe('Blueprint');
    expect(ARCHITECTURE_AGENT_MEETING.canvasType).toBe('blueprint');
  });

  it('has a persona string', () => {
    expect(ARCHITECTURE_AGENT_MEETING.persona).toBeTruthy();
    expect(typeof ARCHITECTURE_AGENT_MEETING.persona).toBe('string');
  });
});

describe('registerArchitectureAgentMeeting', () => {
  it('registers the architecture-agent meeting type in the registry', () => {
    const registry = new MeetingRegistry();
    registerArchitectureAgentMeeting(registry);

    const mt = registry.getById('architecture-agent');
    expect(mt).toBeDefined();
    expect(mt!.id).toBe('architecture-agent');
    expect(mt!.canvasType).toBe('blueprint');
  });
});

describe('Architecture Agent trigger conditions', () => {
  it('matches session_complete event', () => {
    const registry = new MeetingRegistry();
    registerArchitectureAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('session_complete', {});
    expect(matches).toHaveLength(1);
    expect(matches[0].meetingType.id).toBe('architecture-agent');
  });

  it('does not match non-session_complete events', () => {
    const registry = new MeetingRegistry();
    registerArchitectureAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    expect(engine.evaluate('deploy_started', {})).toHaveLength(0);
    expect(engine.evaluate('task_completed', {})).toHaveLength(0);
    expect(engine.evaluate('task_started', {})).toHaveLength(0);
  });
});
