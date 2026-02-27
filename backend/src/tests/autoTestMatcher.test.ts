import { describe, it, expect, vi } from 'vitest';
import { autoMatchTests } from '../services/autoTestMatcher.js';
import type { SendEvent } from '../services/phases/types.js';

function makeSend(): { send: SendEvent; events: Record<string, any>[] } {
  const events: Record<string, any>[] = [];
  const send = vi.fn(async (event) => {
    events.push(event as Record<string, any>);
  }) as unknown as SendEvent;
  return { send, events };
}

describe('autoTestMatcher', () => {
  it('generates tests for unmatched when_then requirements at explorer level', async () => {
    const spec: Record<string, unknown> = {
      workflow: { system_level: 'explorer' },
      requirements: [
        { type: 'when_then', description: 'When the user clicks play happens, the game starts should happen' },
        { type: 'feature', description: 'It should be colorful' },
        { type: 'when_then', description: 'When the score reaches 10 happens, a celebration should happen' },
      ],
    };
    const { send, events } = makeSend();

    const count = await autoMatchTests(spec, send);

    expect(count).toBe(2);
    const workflow = spec.workflow as Record<string, unknown>;
    const tests = workflow.behavioral_tests as Array<Record<string, unknown>>;
    expect(tests).toHaveLength(2);
    expect(tests[0].requirement_id).toBe('req_0');
    expect(tests[1].requirement_id).toBe('req_2');
    expect(workflow.testing_enabled).toBe(true);

    // Check narrator events were sent
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('narrator_message');
    expect(events[0].mood).toBe('encouraging');
  });

  it('does not run at builder level', async () => {
    const spec: Record<string, unknown> = {
      workflow: { system_level: 'builder' },
      requirements: [
        { type: 'when_then', description: 'When X happens, Y should happen' },
      ],
    };
    const { send } = makeSend();

    const count = await autoMatchTests(spec, send);

    expect(count).toBe(0);
    const workflow = spec.workflow as Record<string, unknown>;
    expect(workflow.behavioral_tests).toBeUndefined();
  });

  it('does not run at architect level', async () => {
    const spec: Record<string, unknown> = {
      workflow: { system_level: 'architect' },
      requirements: [
        { type: 'when_then', description: 'When X happens, Y should happen' },
      ],
    };
    const { send } = makeSend();

    const count = await autoMatchTests(spec, send);

    expect(count).toBe(0);
  });

  it('defaults to explorer when no system_level is set', async () => {
    const spec: Record<string, unknown> = {
      workflow: {},
      requirements: [
        { type: 'when_then', description: 'When button clicked, form submits should happen' },
      ],
    };
    const { send } = makeSend();

    const count = await autoMatchTests(spec, send);

    expect(count).toBe(1);
  });

  it('skips requirements that already have a test_id', async () => {
    const spec: Record<string, unknown> = {
      workflow: { system_level: 'explorer' },
      requirements: [
        { type: 'when_then', description: 'When X happens, Y should happen', test_id: 'existing_test' },
      ],
    };
    const { send } = makeSend();

    const count = await autoMatchTests(spec, send);

    expect(count).toBe(0);
  });

  it('skips non-when_then requirements', async () => {
    const spec: Record<string, unknown> = {
      workflow: { system_level: 'explorer' },
      requirements: [
        { type: 'feature', description: 'It should be fast' },
        { type: 'constraint', description: 'No errors on click' },
        { type: 'data', description: 'User info' },
      ],
    };
    const { send } = makeSend();

    const count = await autoMatchTests(spec, send);

    expect(count).toBe(0);
  });

  it('parses when/then from description correctly', async () => {
    const spec: Record<string, unknown> = {
      workflow: { system_level: 'explorer' },
      requirements: [
        { type: 'when_then', description: 'When the user clicks play happens, the game starts should happen' },
      ],
    };
    const { send } = makeSend();

    await autoMatchTests(spec, send);

    const workflow = spec.workflow as Record<string, unknown>;
    const tests = workflow.behavioral_tests as Array<Record<string, unknown>>;
    expect(tests[0].when).toBe('the user clicks play');
    expect(tests[0].then).toBe('the game starts');
  });

  it('uses fallback for non-standard description format', async () => {
    const spec: Record<string, unknown> = {
      workflow: { system_level: 'explorer' },
      requirements: [
        { type: 'when_then', description: 'Something weird' },
      ],
    };
    const { send } = makeSend();

    await autoMatchTests(spec, send);

    const workflow = spec.workflow as Record<string, unknown>;
    const tests = workflow.behavioral_tests as Array<Record<string, unknown>>;
    expect(tests[0].when).toBe('Something weird');
    expect(tests[0].then).toBe('it works as expected');
  });

  it('does not duplicate tests that already cover a requirement', async () => {
    const spec: Record<string, unknown> = {
      workflow: {
        system_level: 'explorer',
        behavioral_tests: [
          { id: 'existing', when: 'X', then: 'Y', requirement_id: 'req_0' },
        ],
      },
      requirements: [
        { type: 'when_then', description: 'When X happens, Y should happen' },
      ],
    };
    const { send } = makeSend();

    const count = await autoMatchTests(spec, send);

    expect(count).toBe(0);
    const workflow = spec.workflow as Record<string, unknown>;
    const tests = workflow.behavioral_tests as Array<Record<string, unknown>>;
    expect(tests).toHaveLength(1);
  });

  it('handles empty requirements array', async () => {
    const spec: Record<string, unknown> = {
      workflow: { system_level: 'explorer' },
      requirements: [],
    };
    const { send } = makeSend();

    const count = await autoMatchTests(spec, send);

    expect(count).toBe(0);
  });

  it('handles missing requirements', async () => {
    const spec: Record<string, unknown> = {
      workflow: { system_level: 'explorer' },
    };
    const { send } = makeSend();

    const count = await autoMatchTests(spec, send);

    expect(count).toBe(0);
  });

  it('links requirements back to generated tests via test_id', async () => {
    const spec: Record<string, unknown> = {
      workflow: { system_level: 'explorer' },
      requirements: [
        { type: 'when_then', description: 'When A happens, B should happen' },
      ],
    };
    const { send } = makeSend();

    await autoMatchTests(spec, send);

    const reqs = spec.requirements as Array<Record<string, unknown>>;
    expect(reqs[0].test_id).toBe('auto_test_0');
  });
});
