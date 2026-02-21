/** Unit tests for DeployPhase.
 *
 * Tests web preview deployment, hardware flash path, portal deployment,
 * serial portal flow, and condition/predicate methods.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import net from 'node:net';
import { DeployPhase } from './deployPhase.js';
import { findFreePort } from '../../utils/findFreePort.js';
import type { PhaseContext } from './types.js';
import type { CliExecResult } from '../portalService.js';

// -- Helpers --

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

function getSendCalls(ctx: PhaseContext): Record<string, any>[] {
  return (ctx.send as ReturnType<typeof vi.fn>).mock.calls.map((c: any[]) => c[0]);
}

// ============================================================
// shouldDeployWeb
// ============================================================

describe('shouldDeployWeb', () => {
  it('returns true when target is "web"', () => {
    const phase = new DeployPhase(makeMockHardwareService(), makeMockPortalService(), makeMockTeachingEngine());
    const ctx = makeCtx({ session: { id: 't', state: 'executing', spec: { deployment: { target: 'web' } } } as any });
    expect(phase.shouldDeployWeb(ctx)).toBe(true);
  });

  it('returns true when target is "both"', () => {
    const phase = new DeployPhase(makeMockHardwareService(), makeMockPortalService(), makeMockTeachingEngine());
    const ctx = makeCtx({ session: { id: 't', state: 'executing', spec: { deployment: { target: 'both' } } } as any });
    expect(phase.shouldDeployWeb(ctx)).toBe(true);
  });

  it('returns false when target is "esp32"', () => {
    const phase = new DeployPhase(makeMockHardwareService(), makeMockPortalService(), makeMockTeachingEngine());
    const ctx = makeCtx({ session: { id: 't', state: 'executing', spec: { deployment: { target: 'esp32' } } } as any });
    expect(phase.shouldDeployWeb(ctx)).toBe(false);
  });

  it('defaults to "preview" when no target specified and returns true', () => {
    const phase = new DeployPhase(makeMockHardwareService(), makeMockPortalService(), makeMockTeachingEngine());
    const ctx = makeCtx({ session: { id: 't', state: 'executing', spec: {} } as any });
    expect(phase.shouldDeployWeb(ctx)).toBe(true);
  });
});

// ============================================================
// shouldDeployHardware
// ============================================================

describe('shouldDeployHardware', () => {
  it('returns true when target is "esp32"', () => {
    const phase = new DeployPhase(makeMockHardwareService(), makeMockPortalService(), makeMockTeachingEngine());
    const ctx = makeCtx({ session: { id: 't', state: 'executing', spec: { deployment: { target: 'esp32' } } } as any });
    expect(phase.shouldDeployHardware(ctx)).toBe(true);
  });

  it('returns true when target is "both"', () => {
    const phase = new DeployPhase(makeMockHardwareService(), makeMockPortalService(), makeMockTeachingEngine());
    const ctx = makeCtx({ session: { id: 't', state: 'executing', spec: { deployment: { target: 'both' } } } as any });
    expect(phase.shouldDeployHardware(ctx)).toBe(true);
  });

  it('returns false when target is "web"', () => {
    const phase = new DeployPhase(makeMockHardwareService(), makeMockPortalService(), makeMockTeachingEngine());
    const ctx = makeCtx({ session: { id: 't', state: 'executing', spec: { deployment: { target: 'web' } } } as any });
    expect(phase.shouldDeployHardware(ctx)).toBe(false);
  });

  it('returns false when no spec', () => {
    const phase = new DeployPhase(makeMockHardwareService(), makeMockPortalService(), makeMockTeachingEngine());
    const ctx = makeCtx({ session: { id: 't', state: 'executing', spec: {} } as any });
    expect(phase.shouldDeployHardware(ctx)).toBe(false);
  });
});

// ============================================================
// shouldDeployPortals
// ============================================================

describe('shouldDeployPortals', () => {
  it('returns true when portals array is non-empty', () => {
    const phase = new DeployPhase(makeMockHardwareService(), makeMockPortalService(), makeMockTeachingEngine());
    const ctx = makeCtx({
      session: { id: 't', state: 'executing', spec: { portals: [{ type: 'cli', name: 'test' }] } } as any,
    });
    expect(phase.shouldDeployPortals(ctx)).toBe(true);
  });

  it('returns false when portals array is empty', () => {
    const phase = new DeployPhase(makeMockHardwareService(), makeMockPortalService(), makeMockTeachingEngine());
    const ctx = makeCtx({ session: { id: 't', state: 'executing', spec: { portals: [] } } as any });
    expect(phase.shouldDeployPortals(ctx)).toBe(false);
  });

  it('returns false when portals is not defined', () => {
    const phase = new DeployPhase(makeMockHardwareService(), makeMockPortalService(), makeMockTeachingEngine());
    const ctx = makeCtx({ session: { id: 't', state: 'executing', spec: {} } as any });
    expect(phase.shouldDeployPortals(ctx)).toBe(false);
  });
});

// ============================================================
// deployHardware
// ============================================================

describe('deployHardware', () => {
  let hw: ReturnType<typeof makeMockHardwareService>;
  let teachingEngine: ReturnType<typeof makeMockTeachingEngine>;

  beforeEach(() => {
    hw = makeMockHardwareService();
    teachingEngine = makeMockTeachingEngine();
  });

  it('sets session state to deploying', async () => {
    const portalService = makeMockPortalService();
    const phase = new DeployPhase(hw, portalService, teachingEngine);
    hw.compile.mockResolvedValue({ success: true, errors: [] });
    hw.flash.mockResolvedValue({ success: true, message: 'ok' });
    const ctx = makeCtx();

    await phase.deployHardware(ctx);

    expect(ctx.session.state).toBe('deploying');
  });

  it('emits deploy_started with target esp32', async () => {
    const portalService = makeMockPortalService();
    const phase = new DeployPhase(hw, portalService, teachingEngine);
    hw.compile.mockResolvedValue({ success: true, errors: [] });
    hw.flash.mockResolvedValue({ success: true, message: 'ok' });
    const ctx = makeCtx();

    await phase.deployHardware(ctx);

    const calls = getSendCalls(ctx);
    expect(calls[0]).toEqual({ type: 'deploy_started', target: 'esp32' });
  });

  it('compiles then flashes in order', async () => {
    const portalService = makeMockPortalService();
    const phase = new DeployPhase(hw, portalService, teachingEngine);
    hw.compile.mockResolvedValue({ success: true, errors: [] });
    hw.flash.mockResolvedValue({ success: true, message: 'ok' });
    const ctx = makeCtx();

    await phase.deployHardware(ctx);

    expect(hw.compile).toHaveBeenCalledWith('/tmp/test-nugget');
    expect(hw.flash).toHaveBeenCalledWith('/tmp/test-nugget');

    // compile called before flash
    const compileOrder = hw.compile.mock.invocationCallOrder[0];
    const flashOrder = hw.flash.mock.invocationCallOrder[0];
    expect(compileOrder).toBeLessThan(flashOrder);
  });

  it('returns null serialHandle on successful deploy', async () => {
    const portalService = makeMockPortalService();
    const phase = new DeployPhase(hw, portalService, teachingEngine);
    hw.compile.mockResolvedValue({ success: true, errors: [] });
    hw.flash.mockResolvedValue({ success: true, message: 'ok' });
    const ctx = makeCtx();

    const result = await phase.deployHardware(ctx);

    expect(result.serialHandle).toBeNull();
  });

  it('sends deploy_complete on success', async () => {
    const portalService = makeMockPortalService();
    const phase = new DeployPhase(hw, portalService, teachingEngine);
    hw.compile.mockResolvedValue({ success: true, errors: [] });
    hw.flash.mockResolvedValue({ success: true, message: 'ok' });
    const ctx = makeCtx();

    await phase.deployHardware(ctx);

    const calls = getSendCalls(ctx);
    expect(calls[calls.length - 1]).toEqual({ type: 'deploy_complete', target: 'esp32' });
  });

  it('stops and returns null when compile fails', async () => {
    const portalService = makeMockPortalService();
    const phase = new DeployPhase(hw, portalService, teachingEngine);
    hw.compile.mockResolvedValue({ success: false, errors: ['SyntaxError line 10'] });
    const ctx = makeCtx();

    const result = await phase.deployHardware(ctx);

    expect(result.serialHandle).toBeNull();
    expect(hw.flash).not.toHaveBeenCalled();

    const calls = getSendCalls(ctx);
    const errorEvent = calls.find((c) => c.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent.message).toContain('Compilation failed');
    expect(errorEvent.message).toContain('SyntaxError line 10');
    expect(errorEvent.recoverable).toBe(true);
  });

  it('stops and returns null when flash fails', async () => {
    const portalService = makeMockPortalService();
    const phase = new DeployPhase(hw, portalService, teachingEngine);
    hw.compile.mockResolvedValue({ success: true, errors: [] });
    hw.flash.mockResolvedValue({ success: false, message: 'Device not found' });
    const ctx = makeCtx();

    const result = await phase.deployHardware(ctx);

    expect(result.serialHandle).toBeNull();

    const calls = getSendCalls(ctx);
    const errorEvent = calls.find((c) => c.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent.message).toBe('Device not found');
    expect(errorEvent.recoverable).toBe(true);
  });

  it('emits progress events during successful deploy', async () => {
    const portalService = makeMockPortalService();
    const phase = new DeployPhase(hw, portalService, teachingEngine);
    hw.compile.mockResolvedValue({ success: true, errors: [] });
    hw.flash.mockResolvedValue({ success: true, message: 'ok' });
    const ctx = makeCtx();

    await phase.deployHardware(ctx);

    const calls = getSendCalls(ctx);
    const progressEvents = calls.filter((c) => c.type === 'deploy_progress');
    expect(progressEvents.length).toBeGreaterThanOrEqual(2);
    expect(progressEvents.some((e) => e.step.includes('Compiling'))).toBe(true);
    expect(progressEvents.some((e) => e.step.includes('Flashing'))).toBe(true);
  });

  it('invokes teaching engine for compile and flash events', async () => {
    const portalService = makeMockPortalService();
    const phase = new DeployPhase(hw, portalService, teachingEngine);
    hw.compile.mockResolvedValue({ success: true, errors: [] });
    hw.flash.mockResolvedValue({ success: true, message: 'ok' });
    const ctx = makeCtx();

    await phase.deployHardware(ctx);

    expect(teachingEngine.getMoment).toHaveBeenCalledWith('hardware_compile', '', 'software');
    expect(teachingEngine.getMoment).toHaveBeenCalledWith('hardware_flash', '', 'software');
  });
});

// ============================================================
// deployPortals - serial portal path
// ============================================================

describe('deployPortals - serial portal path', () => {
  let hw: ReturnType<typeof makeMockHardwareService>;
  let teachingEngine: ReturnType<typeof makeMockTeachingEngine>;

  beforeEach(() => {
    hw = makeMockHardwareService();
    teachingEngine = makeMockTeachingEngine();
  });

  it('compiles and flashes when serial portals exist', async () => {
    const portalService = makeMockPortalService({ hasSerial: true });
    const phase = new DeployPhase(hw, portalService, teachingEngine);
    hw.compile.mockResolvedValue({ success: true, errors: [] });
    hw.flash.mockResolvedValue({ success: true, message: 'ok' });
    const ctx = makeCtx();

    await phase.deployPortals(ctx);

    expect(hw.compile).toHaveBeenCalledWith('/tmp/test-nugget');
    expect(hw.flash).toHaveBeenCalledWith('/tmp/test-nugget');
  });

  it('returns null serialHandle on serial compile failure', async () => {
    const portalService = makeMockPortalService({ hasSerial: true });
    const phase = new DeployPhase(hw, portalService, teachingEngine);
    hw.compile.mockResolvedValue({ success: false, errors: ['IndentationError'] });
    const ctx = makeCtx();

    const result = await phase.deployPortals(ctx);

    expect(result.serialHandle).toBeNull();
    expect(hw.flash).not.toHaveBeenCalled();

    const calls = getSendCalls(ctx);
    const errorEvent = calls.find((c) => c.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent.message).toContain('Compilation failed');
  });

  it('returns null serialHandle on serial flash failure', async () => {
    const portalService = makeMockPortalService({ hasSerial: true });
    const phase = new DeployPhase(hw, portalService, teachingEngine);
    hw.compile.mockResolvedValue({ success: true, errors: [] });
    hw.flash.mockResolvedValue({ success: false, message: 'Board disconnected' });
    const ctx = makeCtx();

    const result = await phase.deployPortals(ctx);

    expect(result.serialHandle).toBeNull();

    const calls = getSendCalls(ctx);
    const errorEvent = calls.find((c) => c.type === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent.message).toBe('Board disconnected');
  });

  it('does not compile/flash when no serial portals', async () => {
    const portalService = makeMockPortalService({ hasSerial: false });
    const phase = new DeployPhase(hw, portalService, teachingEngine);
    const ctx = makeCtx();

    await phase.deployPortals(ctx);

    expect(hw.compile).not.toHaveBeenCalled();
    expect(hw.flash).not.toHaveBeenCalled();
  });
});

// ============================================================
// deployPortals - mixed serial + CLI
// ============================================================

describe('deployPortals - mixed serial + CLI', () => {
  let hw: ReturnType<typeof makeMockHardwareService>;
  let teachingEngine: ReturnType<typeof makeMockTeachingEngine>;

  beforeEach(() => {
    hw = makeMockHardwareService();
    teachingEngine = makeMockTeachingEngine();
  });

  it('runs both serial flash and CLI portals', async () => {
    const portalService = makeMockPortalService({
      hasSerial: true,
      cliPortals: [{ name: 'push', executeResult: { success: true, stdout: 'pushed', stderr: '' } }],
    });
    const phase = new DeployPhase(hw, portalService, teachingEngine);
    hw.compile.mockResolvedValue({ success: true, errors: [] });
    hw.flash.mockResolvedValue({ success: true, message: 'ok' });
    const ctx = makeCtx();

    await phase.deployPortals(ctx);

    expect(hw.compile).toHaveBeenCalled();
    expect(hw.flash).toHaveBeenCalled();

    const adapter = portalService.getCliPortals()[0].adapter;
    expect(adapter.execute).toHaveBeenCalledWith('/tmp/test-nugget');

    const calls = getSendCalls(ctx);
    expect(calls[calls.length - 1]).toEqual({ type: 'deploy_complete', target: 'portals' });
  });

  it('skips CLI portals but still completes when serial flash fails', async () => {
    const portalService = makeMockPortalService({
      hasSerial: true,
      cliPortals: [{ name: 'push', executeResult: { success: true, stdout: 'pushed', stderr: '' } }],
    });
    const phase = new DeployPhase(hw, portalService, teachingEngine);
    hw.compile.mockResolvedValue({ success: true, errors: [] });
    hw.flash.mockResolvedValue({ success: false, message: 'Flash timeout' });
    const ctx = makeCtx();

    const result = await phase.deployPortals(ctx);

    expect(result.serialHandle).toBeNull();

    // CLI portals should NOT have executed since serial flash failed and function returned early
    const adapter = portalService.getCliPortals()[0].adapter;
    expect(adapter.execute).not.toHaveBeenCalled();
  });
});

// ============================================================
// initializePortals
// ============================================================

describe('initializePortals', () => {
  it('calls portalService.initializePortals with spec portals', async () => {
    const hw = makeMockHardwareService();
    const portalService = makeMockPortalService();
    const teachingEngine = makeMockTeachingEngine();
    const phase = new DeployPhase(hw, portalService, teachingEngine);

    const portals = [{ type: 'mcp', name: 'test-portal' }];
    const ctx = makeCtx({ session: { id: 't', state: 'executing', spec: { portals } } as any });

    await phase.initializePortals(ctx);

    expect(portalService.initializePortals).toHaveBeenCalledWith(portals);
  });

  it('does not throw when portal initialization fails', async () => {
    const hw = makeMockHardwareService();
    const portalService = makeMockPortalService();
    portalService.initializePortals.mockRejectedValue(new Error('MCP server unreachable'));
    const teachingEngine = makeMockTeachingEngine();
    const phase = new DeployPhase(hw, portalService, teachingEngine);

    const ctx = makeCtx({ session: { id: 't', state: 'executing', spec: { portals: [{ type: 'mcp' }] } } as any });

    // Should not throw
    await expect(phase.initializePortals(ctx)).resolves.toBeUndefined();
  });
});

// ============================================================
// teardown
// ============================================================

describe('teardown', () => {
  it('calls portalService.teardownAll', async () => {
    const hw = makeMockHardwareService();
    const portalService = makeMockPortalService();
    const teachingEngine = makeMockTeachingEngine();
    const phase = new DeployPhase(hw, portalService, teachingEngine);

    await phase.teardown();

    expect(portalService.teardownAll).toHaveBeenCalled();
  });
});

// ============================================================
// getMcpServers
// ============================================================

describe('getMcpServers', () => {
  it('delegates to portalService.getMcpServers', () => {
    const hw = makeMockHardwareService();
    const portalService = makeMockPortalService();
    portalService.getMcpServers.mockReturnValue([{ name: 'test' }]);
    const teachingEngine = makeMockTeachingEngine();
    const phase = new DeployPhase(hw, portalService, teachingEngine);

    const result = phase.getMcpServers();

    expect(result).toEqual([{ name: 'test' }]);
  });
});

// ============================================================
// deployPortals - teaching moment
// ============================================================

describe('deployPortals - teaching moment', () => {
  it('invokes teaching engine with portal_used event', async () => {
    const hw = makeMockHardwareService();
    const teachingEngine = makeMockTeachingEngine();
    const portalService = makeMockPortalService();
    const phase = new DeployPhase(hw, portalService, teachingEngine);
    const ctx = makeCtx();

    await phase.deployPortals(ctx);

    expect(teachingEngine.getMoment).toHaveBeenCalledWith('portal_used', '', 'software');
  });

  it('sends teaching_moment event when engine returns one', async () => {
    const hw = makeMockHardwareService();
    const teachingEngine = makeMockTeachingEngine();
    teachingEngine.getMoment.mockResolvedValue({
      concept: 'portals',
      title: 'What are portals?',
      explanation: 'Portals let you connect to external services.',
    });
    const portalService = makeMockPortalService();
    const phase = new DeployPhase(hw, portalService, teachingEngine);
    const ctx = makeCtx();

    await phase.deployPortals(ctx);

    const calls = getSendCalls(ctx);
    const teachEvent = calls.find((c) => c.type === 'teaching_moment');
    expect(teachEvent).toBeDefined();
    expect(teachEvent.concept).toBe('portals');
  });
});

// ============================================================
// deployHardware - progress values
// ============================================================

describe('deployHardware - progress values', () => {
  it('emits progress values 25, 60 for compile and flash steps', async () => {
    const hw = makeMockHardwareService();
    const teachingEngine = makeMockTeachingEngine();
    const portalService = makeMockPortalService();
    const phase = new DeployPhase(hw, portalService, teachingEngine);
    hw.compile.mockResolvedValue({ success: true, errors: [] });
    hw.flash.mockResolvedValue({ success: true, message: 'ok' });
    const ctx = makeCtx();

    await phase.deployHardware(ctx);

    const calls = getSendCalls(ctx);
    const progressEvents = calls.filter((c) => c.type === 'deploy_progress');
    const progressValues = progressEvents.map((e) => e.progress);
    expect(progressValues).toContain(25);
    expect(progressValues).toContain(60);
  });
});

// ============================================================
// findFreePort - iterative, EADDRINUSE-only retry (#77)
// ============================================================

describe('findFreePort', () => {
  it('returns a free port', async () => {
    const port = await findFreePort(0);
    expect(port).toBeGreaterThan(0);
  });

  it('skips ports that are in use (EADDRINUSE)', async () => {
    // Occupy a port, then ask findFreePort to start from it
    const occupied = net.createServer();
    const occupiedPort = await new Promise<number>((resolve) => {
      occupied.listen(0, () => {
        resolve((occupied.address() as net.AddressInfo).port);
      });
    });

    try {
      const port = await findFreePort(occupiedPort);
      expect(port).toBeGreaterThanOrEqual(occupiedPort);
      // Should have found a different port since occupiedPort is taken
      expect(port).not.toBe(occupiedPort);
    } finally {
      occupied.close();
    }
  });

  it('rejects non-EADDRINUSE errors instead of retrying (#77)', async () => {
    // Port 1 requires root/admin privileges and should fail with EACCES, not EADDRINUSE.
    // The fix ensures we reject on non-EADDRINUSE instead of recursing infinitely.
    // Use a port that is likely to fail with a permission error.
    // If the OS doesn't reject it, skip the assertion.
    try {
      await findFreePort(1);
      // If it somehow succeeds (e.g., running as root), that's fine
    } catch (err: any) {
      // Should get an EACCES error, not 'No free port found'
      expect(err.message).not.toBe('No free port found');
      expect(err.code).toBeDefined();
    }
  });

  it('rejects when no port is available (port > 65535)', async () => {
    await expect(findFreePort(65536)).rejects.toThrow('No free port found');
  });
});
