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
