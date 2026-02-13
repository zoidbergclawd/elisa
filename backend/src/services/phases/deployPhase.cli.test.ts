/** Tests for CLI portal deployment in DeployPhase. */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeployPhase } from './deployPhase.js';
import type { PhaseContext } from './types.js';
import type { CliExecResult } from '../portalService.js';

function makeCtx(overrides: Partial<PhaseContext> = {}): PhaseContext {
  return {
    session: { id: 'test', state: 'executing', spec: {} } as any,
    send: vi.fn().mockResolvedValue(undefined),
    logger: null,
    nuggetDir: '/tmp/test-nugget',
    nuggetType: 'software',
    abortSignal: new AbortController().signal,
    ...overrides,
  };
}

function makeMockHardwareService() {
  return {
    compile: vi.fn(),
    flash: vi.fn(),
    detectBoard: vi.fn(),
    startSerialMonitor: vi.fn(),
  } as any;
}

function makeMockPortalService(options: {
  hasSerial?: boolean;
  cliPortals?: Array<{
    name: string;
    executeResult: CliExecResult;
  }>;
} = {}) {
  const cliPortals = (options.cliPortals ?? []).map(({ name, executeResult }) => ({
    name,
    adapter: {
      execute: vi.fn().mockResolvedValue(executeResult),
      getCommand: () => 'test-cmd',
      getArgs: () => [],
      getCapabilities: () => [],
      initialize: vi.fn(),
      teardown: vi.fn(),
    },
  }));

  return {
    hasSerialPortals: vi.fn().mockReturnValue(options.hasSerial ?? false),
    getCliPortals: vi.fn().mockReturnValue(cliPortals),
    getMcpServers: vi.fn().mockReturnValue([]),
    teardownAll: vi.fn().mockResolvedValue(undefined),
    initializePortals: vi.fn().mockResolvedValue(undefined),
    getAllRuntimes: vi.fn().mockReturnValue([]),
    getRuntime: vi.fn(),
  } as any;
}

function makeMockTeachingEngine() {
  return {
    getMoment: vi.fn().mockResolvedValue(null),
    getShownConcepts: vi.fn().mockReturnValue([]),
  } as any;
}

describe('DeployPhase - before_deploy rules', () => {
  let hw: ReturnType<typeof makeMockHardwareService>;
  let teachingEngine: ReturnType<typeof makeMockTeachingEngine>;

  beforeEach(() => {
    hw = makeMockHardwareService();
    teachingEngine = makeMockTeachingEngine();
  });

  it('deployHardware sends deploy_checklist for before_deploy rules', async () => {
    const portalService = makeMockPortalService();
    const phase = new DeployPhase(hw, portalService, teachingEngine);

    hw.compile.mockResolvedValue({ success: true, errors: [] });
    hw.flash.mockResolvedValue({ success: true, message: 'ok' });
    hw.detectBoard.mockResolvedValue(null);

    const ctx = makeCtx({
      session: {
        id: 'test', state: 'executing',
        spec: {
          rules: [
            { name: 'Must compile', prompt: 'No errors allowed', trigger: 'before_deploy' },
            { name: 'Always on', prompt: 'Always applies', trigger: 'always' },
          ],
        },
      } as any,
    });

    await phase.deployHardware(ctx);

    const send = ctx.send as ReturnType<typeof vi.fn>;
    const calls = send.mock.calls.map((c: any[]) => c[0]);

    const checklist = calls.find((c: any) => c.type === 'deploy_checklist');
    expect(checklist).toBeDefined();
    expect(checklist.rules).toHaveLength(1);
    expect(checklist.rules[0]).toEqual({ name: 'Must compile', prompt: 'No errors allowed' });
  });

  it('deployPortals sends deploy_checklist for before_deploy rules', async () => {
    const portalService = makeMockPortalService();
    const phase = new DeployPhase(hw, portalService, teachingEngine);

    const ctx = makeCtx({
      session: {
        id: 'test', state: 'executing',
        spec: {
          rules: [
            { name: 'Tests pass', prompt: 'All tests must pass', trigger: 'before_deploy' },
          ],
        },
      } as any,
    });

    await phase.deployPortals(ctx);

    const send = ctx.send as ReturnType<typeof vi.fn>;
    const calls = send.mock.calls.map((c: any[]) => c[0]);

    const checklist = calls.find((c: any) => c.type === 'deploy_checklist');
    expect(checklist).toBeDefined();
    expect(checklist.rules).toHaveLength(1);
    expect(checklist.rules[0]).toEqual({ name: 'Tests pass', prompt: 'All tests must pass' });
  });

  it('deployPortals does not send deploy_checklist when no before_deploy rules exist', async () => {
    const portalService = makeMockPortalService();
    const phase = new DeployPhase(hw, portalService, teachingEngine);

    const ctx = makeCtx({
      session: {
        id: 'test', state: 'executing',
        spec: {
          rules: [
            { name: 'Always', prompt: 'Always applies', trigger: 'always' },
          ],
        },
      } as any,
    });

    await phase.deployPortals(ctx);

    const send = ctx.send as ReturnType<typeof vi.fn>;
    const calls = send.mock.calls.map((c: any[]) => c[0]);

    expect(calls.find((c: any) => c.type === 'deploy_checklist')).toBeUndefined();
  });
});

describe('DeployPhase.deployPortals - CLI portals', () => {
  let hw: ReturnType<typeof makeMockHardwareService>;
  let teachingEngine: ReturnType<typeof makeMockTeachingEngine>;

  beforeEach(() => {
    hw = makeMockHardwareService();
    teachingEngine = makeMockTeachingEngine();
  });

  it('executes CLI portals and sends progress events', async () => {
    const portalService = makeMockPortalService({
      cliPortals: [
        { name: 'lint', executeResult: { success: true, stdout: 'All clean', stderr: '' } },
      ],
    });
    const phase = new DeployPhase(hw, portalService, teachingEngine);
    const ctx = makeCtx();

    await phase.deployPortals(ctx);

    const send = ctx.send as ReturnType<typeof vi.fn>;
    const calls = send.mock.calls.map((c: any[]) => c[0]);

    // Should have deploy_started, deploy_progress for running, deploy_progress for stdout, deploy_complete
    expect(calls[0]).toEqual({ type: 'deploy_started', target: 'portals' });
    expect(calls.some((c: any) => c.type === 'deploy_progress' && c.step.includes('Running CLI portal "lint"'))).toBe(true);
    expect(calls.some((c: any) => c.type === 'deploy_progress' && c.step === 'All clean')).toBe(true);
    expect(calls[calls.length - 1]).toEqual({ type: 'deploy_complete', target: 'portals' });

    // Adapter.execute was called with nuggetDir
    const adapter = portalService.getCliPortals()[0].adapter;
    expect(adapter.execute).toHaveBeenCalledWith('/tmp/test-nugget');
  });

  it('sends error event when CLI portal fails', async () => {
    const portalService = makeMockPortalService({
      cliPortals: [
        { name: 'deploy-tool', executeResult: { success: false, stdout: '', stderr: 'Permission denied' } },
      ],
    });
    const phase = new DeployPhase(hw, portalService, teachingEngine);
    const ctx = makeCtx();

    await phase.deployPortals(ctx);

    const send = ctx.send as ReturnType<typeof vi.fn>;
    const calls = send.mock.calls.map((c: any[]) => c[0]);

    const errorEvent = calls.find((c: any) => c.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent.message).toContain('deploy-tool');
    expect(errorEvent.message).toContain('Permission denied');
    expect(errorEvent.recoverable).toBe(true);

    // Should still send deploy_complete even after failure
    expect(calls[calls.length - 1]).toEqual({ type: 'deploy_complete', target: 'portals' });
  });

  it('handles multiple CLI portals sequentially', async () => {
    const portalService = makeMockPortalService({
      cliPortals: [
        { name: 'first', executeResult: { success: true, stdout: 'done1', stderr: '' } },
        { name: 'second', executeResult: { success: true, stdout: 'done2', stderr: '' } },
      ],
    });
    const phase = new DeployPhase(hw, portalService, teachingEngine);
    const ctx = makeCtx();

    await phase.deployPortals(ctx);

    const send = ctx.send as ReturnType<typeof vi.fn>;
    const calls = send.mock.calls.map((c: any[]) => c[0]);

    const runningSteps = calls.filter(
      (c: any) => c.type === 'deploy_progress' && c.step?.includes('Running CLI portal'),
    );
    expect(runningSteps).toHaveLength(2);
    expect(runningSteps[0].step).toContain('first');
    expect(runningSteps[1].step).toContain('second');
  });

  it('does not send stdout progress when stdout is empty', async () => {
    const portalService = makeMockPortalService({
      cliPortals: [
        { name: 'quiet', executeResult: { success: true, stdout: '', stderr: '' } },
      ],
    });
    const phase = new DeployPhase(hw, portalService, teachingEngine);
    const ctx = makeCtx();

    await phase.deployPortals(ctx);

    const send = ctx.send as ReturnType<typeof vi.fn>;
    const calls = send.mock.calls.map((c: any[]) => c[0]);

    // Should only have: deploy_started, running progress, deploy_complete
    const progressCalls = calls.filter((c: any) => c.type === 'deploy_progress');
    expect(progressCalls).toHaveLength(1); // Only the "Running CLI portal" one
    expect(progressCalls[0].step).toContain('Running CLI portal');
  });

  it('skips CLI execution when no CLI portals exist', async () => {
    const portalService = makeMockPortalService({ cliPortals: [] });
    const phase = new DeployPhase(hw, portalService, teachingEngine);
    const ctx = makeCtx();

    await phase.deployPortals(ctx);

    const send = ctx.send as ReturnType<typeof vi.fn>;
    const calls = send.mock.calls.map((c: any[]) => c[0]);

    expect(calls).toHaveLength(2); // deploy_started + deploy_complete
    expect(calls[0]).toEqual({ type: 'deploy_started', target: 'portals' });
    expect(calls[calls.length - 1]).toEqual({ type: 'deploy_complete', target: 'portals' });
  });
});
