import { describe, it, expect } from 'vitest';
import { MeetingRegistry, MeetingTriggerEngine } from '../services/meetingRegistry.js';
import { DOC_AGENT_MEETING, registerDocAgentMeeting } from '../services/docAgentMeeting.js';

describe('DOC_AGENT_MEETING', () => {
  it('has the correct id, name, agentName, and canvasType', () => {
    expect(DOC_AGENT_MEETING.id).toBe('doc-agent');
    expect(DOC_AGENT_MEETING.name).toBe('Documentation Agent');
    expect(DOC_AGENT_MEETING.agentName).toBe('Scribe');
    expect(DOC_AGENT_MEETING.canvasType).toBe('explain-it');
  });

  it('has a persona string', () => {
    expect(DOC_AGENT_MEETING.persona).toBeTruthy();
    expect(typeof DOC_AGENT_MEETING.persona).toBe('string');
  });
});

describe('registerDocAgentMeeting', () => {
  it('registers the doc-agent meeting type in the registry', () => {
    const registry = new MeetingRegistry();
    registerDocAgentMeeting(registry);

    const mt = registry.getById('doc-agent');
    expect(mt).toBeDefined();
    expect(mt!.id).toBe('doc-agent');
    expect(mt!.canvasType).toBe('explain-it');
  });
});

describe('Doc Agent trigger conditions', () => {
  it('matches session_complete event', () => {
    const registry = new MeetingRegistry();
    registerDocAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('session_complete', {});
    expect(matches).toHaveLength(1);
    expect(matches[0].meetingType.id).toBe('doc-agent');
  });

  it('does not match non-session_complete events', () => {
    const registry = new MeetingRegistry();
    registerDocAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    expect(engine.evaluate('deploy_started', {})).toHaveLength(0);
    expect(engine.evaluate('task_completed', {})).toHaveLength(0);
    expect(engine.evaluate('task_started', {})).toHaveLength(0);
  });
});
