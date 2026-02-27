import { describe, it, expect } from 'vitest';
import { MeetingRegistry, MeetingTriggerEngine } from '../services/meetingRegistry.js';
import { registerIntegrationAgentMeeting, INTEGRATION_AGENT_MEETING } from '../services/integrationAgentMeeting.js';

describe('Integration Agent Meeting', () => {
  it('has correct id', () => {
    expect(INTEGRATION_AGENT_MEETING.id).toBe('integration-agent');
  });

  it('has correct name', () => {
    expect(INTEGRATION_AGENT_MEETING.name).toBe('Integration Meeting');
  });

  it('has correct agentName', () => {
    expect(INTEGRATION_AGENT_MEETING.agentName).toBe('Interface Designer');
  });

  it('has correct canvasType', () => {
    expect(INTEGRATION_AGENT_MEETING.canvasType).toBe('interface-designer');
  });

  it('triggers on composition_started event', () => {
    expect(INTEGRATION_AGENT_MEETING.triggerConditions).toHaveLength(1);
    expect(INTEGRATION_AGENT_MEETING.triggerConditions[0].event).toBe('composition_started');
  });

  it('has a persona string', () => {
    expect(typeof INTEGRATION_AGENT_MEETING.persona).toBe('string');
    expect(INTEGRATION_AGENT_MEETING.persona.length).toBeGreaterThan(0);
  });

  it('registers successfully in a MeetingRegistry', () => {
    const registry = new MeetingRegistry();
    registerIntegrationAgentMeeting(registry);

    expect(registry.size).toBe(1);
    expect(registry.getById('integration-agent')).toBe(INTEGRATION_AGENT_MEETING);
  });

  it('is matched by MeetingTriggerEngine on composition_started', () => {
    const registry = new MeetingRegistry();
    registerIntegrationAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('composition_started');
    expect(matches).toHaveLength(1);
    expect(matches[0].meetingType.id).toBe('integration-agent');
  });

  it('is not matched on unrelated events', () => {
    const registry = new MeetingRegistry();
    registerIntegrationAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    expect(engine.evaluate('task_started')).toHaveLength(0);
    expect(engine.evaluate('deploy_started')).toHaveLength(0);
    expect(engine.evaluate('session_complete')).toHaveLength(0);
  });
});
