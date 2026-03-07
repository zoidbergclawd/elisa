import { describe, it, expect } from 'vitest';
import { MeetingRegistry, MeetingTriggerEngine } from '../services/meetingRegistry.js';
import type { MeetingType } from '../models/meeting.js';

function makeMeetingType(overrides?: Partial<MeetingType>): MeetingType {
  return {
    id: 'test-meeting',
    name: 'Test Meeting',
    agentName: 'TestAgent',
    canvasType: 'test-canvas',
    triggerConditions: [],
    persona: 'A friendly test agent',
    ...overrides,
  };
}

describe('MeetingRegistry', () => {
  it('starts empty', () => {
    const registry = new MeetingRegistry();
    expect(registry.getAll()).toHaveLength(0);
    expect(registry.size).toBe(0);
  });

  it('registers and retrieves a meeting type', () => {
    const registry = new MeetingRegistry();
    const mt = makeMeetingType();
    registry.register(mt);

    expect(registry.size).toBe(1);
    expect(registry.getById('test-meeting')).toBe(mt);
  });

  it('getAll returns all registered types', () => {
    const registry = new MeetingRegistry();
    registry.register(makeMeetingType({ id: 'a', name: 'A' }));
    registry.register(makeMeetingType({ id: 'b', name: 'B' }));

    const all = registry.getAll();
    expect(all).toHaveLength(2);
    expect(all.map(t => t.id)).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('overwrites duplicate IDs', () => {
    const registry = new MeetingRegistry();
    registry.register(makeMeetingType({ id: 'dup', name: 'First' }));
    registry.register(makeMeetingType({ id: 'dup', name: 'Second' }));

    expect(registry.size).toBe(1);
    expect(registry.getById('dup')!.name).toBe('Second');
  });

  it('getById returns undefined for unknown id', () => {
    const registry = new MeetingRegistry();
    expect(registry.getById('nope')).toBeUndefined();
  });

  it('unregister removes a type and returns true', () => {
    const registry = new MeetingRegistry();
    registry.register(makeMeetingType({ id: 'rm' }));
    expect(registry.unregister('rm')).toBe(true);
    expect(registry.size).toBe(0);
    expect(registry.getById('rm')).toBeUndefined();
  });

  it('unregister returns false for unknown id', () => {
    const registry = new MeetingRegistry();
    expect(registry.unregister('nope')).toBe(false);
  });
});

describe('MeetingRegistry dynamic registration', () => {
  it('registerDynamic creates meeting types with generated IDs', () => {
    const registry = new MeetingRegistry();
    const ids = registry.registerDynamic('session-1', [
      { name: 'Coach', persona: 'Gives tips', canvasType: 'explain-it' },
      { name: 'Artist', persona: 'Draws things', canvasType: 'design-preview' },
    ]);

    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe('custom-session-1-0');
    expect(ids[1]).toBe('custom-session-1-1');

    const coach = registry.getById('custom-session-1-0');
    expect(coach).toBeDefined();
    expect(coach!.agentName).toBe('Coach');
    expect(coach!.persona).toBe('Gives tips');
    expect(coach!.canvasType).toBe('explain-it');
  });

  it('assigns triggers based on canvas type', () => {
    const registry = new MeetingRegistry();
    registry.registerDynamic('s1', [
      { name: 'Doc Expert', persona: 'Writes docs', canvasType: 'explain-it' },
    ]);

    const engine = new MeetingTriggerEngine(registry);
    // explain-it trigger fires at 40% progress
    const matches = engine.evaluate('task_completed', { tasks_done: 2, tasks_total: 5 });
    expect(matches).toHaveLength(1);
    expect(matches[0].meetingType.agentName).toBe('Doc Expert');
  });

  it('assigns default trigger for unknown canvas types', () => {
    const registry = new MeetingRegistry();
    registry.registerDynamic('s1', [
      { name: 'Mystery', persona: 'Unknown', canvasType: 'unknown-type' },
    ]);

    const engine = new MeetingTriggerEngine(registry);
    // Default trigger fires at 50%
    const noMatch = engine.evaluate('task_completed', { tasks_done: 1, tasks_total: 4 });
    expect(noMatch).toHaveLength(0);

    const match = engine.evaluate('task_completed', { tasks_done: 2, tasks_total: 4 });
    expect(match).toHaveLength(1);
  });

  it('unregisterDynamic removes all dynamic types for a session', () => {
    const registry = new MeetingRegistry();
    registry.registerDynamic('s1', [
      { name: 'A', persona: 'p', canvasType: 'explain-it' },
      { name: 'B', persona: 'p', canvasType: 'blueprint' },
    ]);

    expect(registry.size).toBe(2);
    registry.unregisterDynamic('s1');
    expect(registry.size).toBe(0);
    expect(registry.getById('custom-s1-0')).toBeUndefined();
  });

  it('unregisterDynamic is no-op for unknown session', () => {
    const registry = new MeetingRegistry();
    registry.unregisterDynamic('no-such-session');
    expect(registry.size).toBe(0);
  });
});

describe('MeetingTriggerEngine', () => {
  it('returns empty array when no types registered', () => {
    const registry = new MeetingRegistry();
    const engine = new MeetingTriggerEngine(registry);
    expect(engine.evaluate('task_failed')).toHaveLength(0);
  });

  it('matches a meeting type by event name', () => {
    const registry = new MeetingRegistry();
    registry.register(makeMeetingType({
      id: 'debug',
      triggerConditions: [{ event: 'task_failed' }],
    }));
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('task_failed');
    expect(matches).toHaveLength(1);
    expect(matches[0].meetingType.id).toBe('debug');
  });

  it('does not match unrelated events', () => {
    const registry = new MeetingRegistry();
    registry.register(makeMeetingType({
      id: 'debug',
      triggerConditions: [{ event: 'task_failed' }],
    }));
    const engine = new MeetingTriggerEngine(registry);

    expect(engine.evaluate('task_completed')).toHaveLength(0);
  });

  it('applies filter function when present', () => {
    const registry = new MeetingRegistry();
    registry.register(makeMeetingType({
      id: 'art',
      triggerConditions: [{
        event: 'task_completed',
        filter: (data) => data.task_type === 'scaffold',
      }],
    }));
    const engine = new MeetingTriggerEngine(registry);

    // Should not match when filter returns false
    expect(engine.evaluate('task_completed', { task_type: 'build' })).toHaveLength(0);

    // Should match when filter returns true
    const matches = engine.evaluate('task_completed', { task_type: 'scaffold' });
    expect(matches).toHaveLength(1);
    expect(matches[0].meetingType.id).toBe('art');
  });

  it('matches multiple meeting types for the same event', () => {
    const registry = new MeetingRegistry();
    registry.register(makeMeetingType({
      id: 'debug',
      triggerConditions: [{ event: 'task_failed' }],
    }));
    registry.register(makeMeetingType({
      id: 'review',
      triggerConditions: [{ event: 'task_failed' }],
    }));
    const engine = new MeetingTriggerEngine(registry);

    const matches = engine.evaluate('task_failed');
    expect(matches).toHaveLength(2);
    expect(matches.map(m => m.meetingType.id)).toEqual(expect.arrayContaining(['debug', 'review']));
  });

  it('only matches one condition per meeting type', () => {
    const registry = new MeetingRegistry();
    registry.register(makeMeetingType({
      id: 'multi',
      triggerConditions: [
        { event: 'task_failed' },
        { event: 'task_failed' }, // duplicate condition
      ],
    }));
    const engine = new MeetingTriggerEngine(registry);

    // Should only appear once even with two matching conditions
    const matches = engine.evaluate('task_failed');
    expect(matches).toHaveLength(1);
  });

  it('passes eventData to filter function', () => {
    const registry = new MeetingRegistry();
    let receivedData: Record<string, unknown> | undefined;
    registry.register(makeMeetingType({
      id: 'spy',
      triggerConditions: [{
        event: 'test_result',
        filter: (data) => { receivedData = data; return true; },
      }],
    }));
    const engine = new MeetingTriggerEngine(registry);

    const eventData = { test_name: 'login', passed: false };
    engine.evaluate('test_result', eventData);
    expect(receivedData).toEqual(eventData);
  });
});
