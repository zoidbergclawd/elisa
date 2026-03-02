import { describe, it, expect } from 'vitest';
import { MeetingRegistry, MeetingTriggerEngine } from '../services/meetingRegistry.js';
import { ART_AGENT_MEETING, registerArtAgentMeeting } from '../services/artAgentMeeting.js';

describe('ART_AGENT_MEETING', () => {
  it('has the correct id, name, agentName, and canvasType', () => {
    expect(ART_AGENT_MEETING.id).toBe('art-agent');
    expect(ART_AGENT_MEETING.name).toBe('Art Agent');
    expect(ART_AGENT_MEETING.agentName).toBe('Pixel');
    expect(ART_AGENT_MEETING.canvasType).toBe('agent-studio');
  });

  it('has a persona string', () => {
    expect(ART_AGENT_MEETING.persona).toBeTruthy();
    expect(typeof ART_AGENT_MEETING.persona).toBe('string');
  });
});

describe('registerArtAgentMeeting', () => {
  it('registers the art-agent meeting type in the registry', () => {
    const registry = new MeetingRegistry();
    registerArtAgentMeeting(registry);

    const mt = registry.getById('art-agent');
    expect(mt).toBeDefined();
    expect(mt!.id).toBe('art-agent');
    expect(mt!.canvasType).toBe('agent-studio');
  });
});

describe('Art Agent trigger conditions', () => {
  it('matches deploy_started with a BOX-3 device in devices array', () => {
    const registry = new MeetingRegistry();
    registerArtAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('deploy_started', {
      devices: [{ type: 'box-3', name: 'My Bot' }],
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].meetingType.id).toBe('art-agent');
  });

  it('matches deploy_started with device_type box-3', () => {
    const registry = new MeetingRegistry();
    registerArtAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('deploy_started', {
      device_type: 'box-3',
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].meetingType.id).toBe('art-agent');
  });

  it('does not match deploy_started without BOX-3 device', () => {
    const registry = new MeetingRegistry();
    registerArtAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('deploy_started', {
      devices: [{ type: 'esp32-generic', name: 'Sensor' }],
    });
    expect(matches).toHaveLength(0);
  });

  it('does not match deploy_started with no device info', () => {
    const registry = new MeetingRegistry();
    registerArtAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('deploy_started', {});
    expect(matches).toHaveLength(0);
  });

  it('does not match plan_ready (removed trigger)', () => {
    const registry = new MeetingRegistry();
    registerArtAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    expect(engine.evaluate('plan_ready', { device_types: ['box-3'] })).toHaveLength(0);
  });

  it('does not match task_completed', () => {
    const registry = new MeetingRegistry();
    registerArtAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    expect(engine.evaluate('task_completed', { device_type: 'box-3' })).toHaveLength(0);
  });

  it('has only one trigger condition (deploy_started)', () => {
    expect(ART_AGENT_MEETING.triggerConditions).toHaveLength(1);
    expect(ART_AGENT_MEETING.triggerConditions[0].event).toBe('deploy_started');
  });
});
