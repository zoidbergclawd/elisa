/** Unit tests for TestPhase. */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { TestPhase } from './testPhase.js';
import type { PhaseContext } from './types.js';
import { TestRunner } from '../testRunner.js';
import { TeachingEngine } from '../teachingEngine.js';

vi.mock('../testRunner.js');
vi.mock('../teachingEngine.js');

function makeCtx(overrides: Partial<PhaseContext> = {}): PhaseContext {
  return {
    session: { id: 'test', state: 'executing', spec: {}, tasks: [], agents: [] } as any,
    send: vi.fn().mockResolvedValue(undefined),
    logger: { phase: vi.fn(), testResults: vi.fn() } as any,
    nuggetDir: '/tmp/test-nugget',
    nuggetType: 'software',
    abortSignal: new AbortController().signal,
    ...overrides,
  };
}

describe('TestPhase', () => {
  let testRunner: TestRunner;
  let teachingEngine: TeachingEngine;

  beforeEach(() => {
    vi.restoreAllMocks();
    testRunner = new TestRunner();
    teachingEngine = new TeachingEngine();
    vi.mocked(teachingEngine.getMoment).mockResolvedValue(null);
  });

  it('calls testRunner.runTests() and sends test_result events for each test', async () => {
    const tests = [
      { test_name: 'renders page', passed: true, details: 'ok' },
      { test_name: 'handles click', passed: false, details: 'assertion failed' },
    ];
    vi.mocked(testRunner.runTests).mockResolvedValue({
      tests,
      passed: 1,
      failed: 1,
      total: 2,
      coverage_pct: null,
      coverage_details: null,
    });

    const ctx = makeCtx();
    const phase = new TestPhase(testRunner, teachingEngine);
    await phase.execute(ctx);

    expect(testRunner.runTests).toHaveBeenCalledWith('/tmp/test-nugget');

    const testEvents = vi.mocked(ctx.send).mock.calls
      .filter(([ev]) => ev.type === 'test_result');
    expect(testEvents).toHaveLength(2);
    expect(testEvents[0][0]).toMatchObject({
      type: 'test_result',
      test_name: 'renders page',
      passed: true,
    });
    expect(testEvents[1][0]).toMatchObject({
      type: 'test_result',
      test_name: 'handles click',
      passed: false,
    });
  });

  it('sends coverage_update when coverage_pct is not null', async () => {
    vi.mocked(testRunner.runTests).mockResolvedValue({
      tests: [{ test_name: 'test1', passed: true, details: '' }],
      passed: 1,
      failed: 0,
      total: 1,
      coverage_pct: 85,
      coverage_details: { lines: 85 },
    });

    const ctx = makeCtx();
    const phase = new TestPhase(testRunner, teachingEngine);
    await phase.execute(ctx);

    const coverageEvent = vi.mocked(ctx.send).mock.calls
      .find(([ev]) => ev.type === 'coverage_update');
    expect(coverageEvent).toBeDefined();
    expect(coverageEvent![0].percentage).toBe(85);
    expect(coverageEvent![0].details).toEqual({ lines: 85 });
  });

  it('does NOT send coverage_update when coverage_pct is null', async () => {
    vi.mocked(testRunner.runTests).mockResolvedValue({
      tests: [{ test_name: 'test1', passed: true, details: '' }],
      passed: 1,
      failed: 0,
      total: 1,
      coverage_pct: null,
      coverage_details: null,
    });

    const ctx = makeCtx();
    const phase = new TestPhase(testRunner, teachingEngine);
    await phase.execute(ctx);

    const coverageEvent = vi.mocked(ctx.send).mock.calls
      .find(([ev]) => ev.type === 'coverage_update');
    expect(coverageEvent).toBeUndefined();
  });

  it('sets session.state to testing', async () => {
    vi.mocked(testRunner.runTests).mockResolvedValue({
      tests: [],
      passed: 0,
      failed: 0,
      total: 0,
      coverage_pct: null,
      coverage_details: null,
    });

    const ctx = makeCtx();
    const phase = new TestPhase(testRunner, teachingEngine);
    await phase.execute(ctx);

    expect(ctx.session.state).toBe('testing');
  });

  it('returns testResults from the runner', async () => {
    const runnerResult = {
      tests: [{ test_name: 'a', passed: true, details: '' }],
      passed: 1,
      failed: 0,
      total: 1,
      coverage_pct: null,
      coverage_details: null,
    };
    vi.mocked(testRunner.runTests).mockResolvedValue(runnerResult);

    const ctx = makeCtx();
    const phase = new TestPhase(testRunner, teachingEngine);
    const result = await phase.execute(ctx);

    expect(result.testResults).toBe(runnerResult);
  });

  it('calls logger.testResults with correct arguments', async () => {
    vi.mocked(testRunner.runTests).mockResolvedValue({
      tests: [],
      passed: 3,
      failed: 1,
      total: 4,
      coverage_pct: 72,
      coverage_details: null,
    });

    const ctx = makeCtx();
    const phase = new TestPhase(testRunner, teachingEngine);
    await phase.execute(ctx);

    expect(ctx.logger!.testResults).toHaveBeenCalledWith(3, 1, 4, 72);
  });
});
