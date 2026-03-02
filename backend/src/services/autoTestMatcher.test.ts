import { describe, it, expect, vi } from 'vitest';
import { autoMatchTests } from './autoTestMatcher.js';

function makeSpec(overrides: Record<string, unknown> = {}) {
  return {
    nugget: { goal: 'test', description: 'test', type: 'general' },
    requirements: [],
    agents: [],
    deployment: { target: 'preview', auto_flash: false },
    workflow: {
      review_enabled: false,
      testing_enabled: false,
      human_gates: [],
      system_level: 'explorer',
    },
    ...overrides,
  } as any;
}

describe('autoTestMatcher', () => {
  it('generates test for when_then requirement without test_id', async () => {
    const send = vi.fn();
    const spec = makeSpec({
      requirements: [
        { type: 'when_then', description: 'When click happens, jump should happen' },
      ],
    });
    const count = await autoMatchTests(spec, send);
    expect(count).toBe(1);
    expect(spec.requirements[0].test_id).toBe('auto_test_0');
    expect(spec.workflow.behavioral_tests).toHaveLength(1);
    expect(spec.workflow.behavioral_tests[0]).toMatchObject({
      id: 'auto_test_0',
      when: 'click',
      then: 'jump',
      requirement_id: 'req_0',
    });
    expect(spec.workflow.testing_enabled).toBe(true);
  });

  it('generates test for feature requirement without test_id', async () => {
    const send = vi.fn();
    const spec = makeSpec({
      requirements: [
        { type: 'feature', description: 'play music' },
      ],
    });
    const count = await autoMatchTests(spec, send);
    expect(count).toBe(1);
    expect(spec.requirements[0].test_id).toBe('auto_test_0');
    expect(spec.workflow.behavioral_tests).toHaveLength(1);
    expect(spec.workflow.behavioral_tests[0]).toMatchObject({
      id: 'auto_test_0',
      when: 'the user uses the feature: play music',
      then: 'play music works correctly',
      requirement_id: 'req_0',
    });
  });

  it('generates test for data requirement without test_id', async () => {
    const send = vi.fn();
    const spec = makeSpec({
      requirements: [
        { type: 'data', description: 'user scores' },
      ],
    });
    const count = await autoMatchTests(spec, send);
    expect(count).toBe(1);
    expect(spec.requirements[0].test_id).toBe('auto_test_0');
    expect(spec.workflow.behavioral_tests).toHaveLength(1);
    expect(spec.workflow.behavioral_tests[0]).toMatchObject({
      id: 'auto_test_0',
      when: 'data is accessed: user scores',
      then: 'user scores is stored and retrievable',
      requirement_id: 'req_0',
    });
  });

  it('skips requirements that already have test_id', async () => {
    const send = vi.fn();
    const spec = makeSpec({
      requirements: [
        { type: 'feature', description: 'play music', test_id: 'test_0' },
        { type: 'data', description: 'user scores', test_id: 'test_1' },
      ],
    });
    const count = await autoMatchTests(spec, send);
    expect(count).toBe(0);
  });

  it('skips constraint requirements (not testable)', async () => {
    const send = vi.fn();
    const spec = makeSpec({
      requirements: [
        { type: 'constraint', description: 'do not crash' },
      ],
    });
    const count = await autoMatchTests(spec, send);
    expect(count).toBe(0);
  });

  it('does not run at builder level', async () => {
    const send = vi.fn();
    const spec = makeSpec({
      requirements: [{ type: 'feature', description: 'play music' }],
      workflow: { system_level: 'builder', testing_enabled: false, review_enabled: false, human_gates: [] },
    });
    const count = await autoMatchTests(spec, send);
    expect(count).toBe(0);
  });

  it('does not run at architect level', async () => {
    const send = vi.fn();
    const spec = makeSpec({
      requirements: [{ type: 'data', description: 'scores' }],
      workflow: { system_level: 'architect', testing_enabled: false, review_enabled: false, human_gates: [] },
    });
    const count = await autoMatchTests(spec, send);
    expect(count).toBe(0);
  });

  it('generates tests for mixed requirement types', async () => {
    const send = vi.fn();
    const spec = makeSpec({
      requirements: [
        { type: 'feature', description: 'play music' },
        { type: 'constraint', description: 'do not crash' },
        { type: 'when_then', description: 'When click happens, jump should happen' },
        { type: 'data', description: 'user scores' },
      ],
    });
    const count = await autoMatchTests(spec, send);
    expect(count).toBe(3); // feature, when_then, data (constraint skipped)
    expect(spec.workflow.behavioral_tests).toHaveLength(3);
    expect(spec.requirements[0].test_id).toBe('auto_test_0');
    expect(spec.requirements[1].test_id).toBeUndefined(); // constraint
    expect(spec.requirements[2].test_id).toBe('auto_test_2');
    expect(spec.requirements[3].test_id).toBe('auto_test_3');
  });

  it('sends narrator message with correct label for each type', async () => {
    const send = vi.fn();
    const spec = makeSpec({
      requirements: [
        { type: 'feature', description: 'play music' },
        { type: 'when_then', description: 'When click happens, jump should happen' },
        { type: 'data', description: 'user scores' },
      ],
    });
    await autoMatchTests(spec, send);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[0][0].text).toContain('feature');
    expect(send.mock.calls[1][0].text).toContain('rule');
    expect(send.mock.calls[2][0].text).toContain('data');
  });
});
