import { describe, it, expect } from 'vitest';
import { MeetingRegistry, MeetingTriggerEngine } from '../services/meetingRegistry.js';
import { BUDDY_AGENT_MEETING, registerBuddyAgentMeeting } from '../services/buddyAgentMeeting.js';

describe('BUDDY_AGENT_MEETING', () => {
  it('has the correct id, name, agentName, and canvasType', () => {
    expect(BUDDY_AGENT_MEETING.id).toBe('buddy-agent');
    expect(BUDDY_AGENT_MEETING.name).toBe('Buddy Check-in');
    expect(BUDDY_AGENT_MEETING.agentName).toBe('Buddy');
    expect(BUDDY_AGENT_MEETING.canvasType).toBe('explain-it');
  });

  it('has a persona string', () => {
    expect(BUDDY_AGENT_MEETING.persona).toBeTruthy();
    expect(typeof BUDDY_AGENT_MEETING.persona).toBe('string');
  });
});

describe('registerBuddyAgentMeeting', () => {
  it('registers the buddy-agent meeting type in the registry', () => {
    const registry = new MeetingRegistry();
    registerBuddyAgentMeeting(registry);

    const mt = registry.getById('buddy-agent');
    expect(mt).toBeDefined();
    expect(mt!.id).toBe('buddy-agent');
    expect(mt!.canvasType).toBe('explain-it');
  });
});

describe('Buddy Agent trigger conditions', () => {
  it('matches task_completed at 25% progress (1 of 4 tasks)', () => {
    const registry = new MeetingRegistry();
    registerBuddyAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('task_completed', { tasks_done: 1, tasks_total: 4 });
    expect(matches).toHaveLength(1);
    expect(matches[0].meetingType.id).toBe('buddy-agent');
  });

  it('matches task_completed above 25% progress (2 of 4 tasks)', () => {
    const registry = new MeetingRegistry();
    registerBuddyAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('task_completed', { tasks_done: 2, tasks_total: 4 });
    expect(matches).toHaveLength(1);
  });

  it('does not match task_completed below 25% progress (0 of 4 tasks)', () => {
    const registry = new MeetingRegistry();
    registerBuddyAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('task_completed', { tasks_done: 0, tasks_total: 4 });
    expect(matches).toHaveLength(0);
  });

  it('does not match deploy_started or session_complete', () => {
    const registry = new MeetingRegistry();
    registerBuddyAgentMeeting(registry);
    const engine = new MeetingTriggerEngine(registry);

    expect(engine.evaluate('deploy_started', {})).toHaveLength(0);
    expect(engine.evaluate('session_complete', {})).toHaveLength(0);
  });
});
