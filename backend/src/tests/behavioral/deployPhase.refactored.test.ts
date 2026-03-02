import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DeployPhase } from '../../services/phases/deployPhase.js';
import type { PhaseContext } from '../../services/phases/types.js';
import type { RuntimeProvisioner, ProvisionResult } from '../../services/runtimeProvisioner.js';

// ── Mocks ───────────────────────────────────────────────────────────────

function makeMockHardwareService() {
  return {
    flashFiles: vi.fn(async () => ({ success: true, message: 'Flashed OK' })),
    wipeBoard: vi.fn(async () => ({ success: true, removed: [] })),
    resetBoard: vi.fn(async () => {}),
    detectBoard: vi.fn(async () => null),
    compile: vi.fn(async () => ({ success: true, errors: [], outputPath: '' })),
  };
}

function makeMockPortalService() {
  return {
    initializePortals: vi.fn(async () => {}),
    teardownAll: vi.fn(async () => {}),
    getMcpServers: vi.fn(() => []),
    getCliPortals: vi.fn(() => []),
  };
}

function makeMockTeachingEngine() {
  return {
    getMoment: vi.fn(async () => null),
  };
}

function makeMockDeviceRegistry(manifests: Record<string, any> = {}) {
  return {
    getDevice: vi.fn((id: string) => manifests[id]),
    getAllDevices: vi.fn(() => Object.values(manifests)),
    getFlashFiles: vi.fn(() => ({ lib: [], shared: [] })),
    getScaffoldDir: vi.fn(() => null),
    getAgentContext: vi.fn(() => ''),
    getPluginDir: vi.fn(() => '/tmp/test-plugin'),
  };
}

function makeMockProvisioner(overrides: Partial<RuntimeProvisioner> = {}): RuntimeProvisioner {
  return {
    provision: vi.fn(async (): Promise<ProvisionResult> => ({
      agent_id: 'test-agent-id',
      api_key: 'test-api-key',
      runtime_url: 'http://localhost:9000',
    })),
    updateConfig: vi.fn(async () => {}),
    classifyChanges: vi.fn(() => 'config_only' as const),
    ...overrides,
  };
}

function makeCtx(overrides: Partial<PhaseContext> = {}): PhaseContext {
  return {
    session: {
      id: 'test-session',
      state: 'executing',
      spec: {},
      tasks: [],
      agents: [],
    },
    send: vi.fn(async () => {}),
    logger: null,
    nuggetDir: '/tmp/test-nugget',
    nuggetType: 'iot',
    abortSignal: new AbortController().signal,
    ...overrides,
  };
}

function makeGateResolver() {
  return { current: null as ((value: Record<string, any>) => void) | null };
}

/** Create a real temp directory for tests that write files. */
function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'elisa-test-'));
}

// ── Cleanup ─────────────────────────────────────────────────────────────

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  tmpDirs.length = 0;
});

// ── Tests ───────────────────────────────────────────────────────────────

describe('DeployPhase (refactored with strategies)', () => {
  describe('backward compatibility: existing mpremote deploy', () => {
    it('shouldDeployDevices returns true when spec has devices', () => {
      const phase = new DeployPhase(
        makeMockHardwareService() as any,
        makeMockPortalService() as any,
        makeMockTeachingEngine() as any,
      );
      const ctx = makeCtx({
        session: {
          id: 's1', state: 'executing',
          spec: { devices: [{ pluginId: 'sensor', instanceId: 's1', fields: {} }] },
          tasks: [], agents: [],
        },
      });
      expect(phase.shouldDeployDevices(ctx)).toBe(true);
    });

    it('shouldDeployDevices returns false when no devices', () => {
      const phase = new DeployPhase(
        makeMockHardwareService() as any,
        makeMockPortalService() as any,
        makeMockTeachingEngine() as any,
      );
      const ctx = makeCtx();
      expect(phase.shouldDeployDevices(ctx)).toBe(false);
    });

    it('deploys flash device via MpremoteFlashStrategy', async () => {
      const hw = makeMockHardwareService();
      const nuggetDir = makeTempDir();
      tmpDirs.push(nuggetDir);

      const registry = makeMockDeviceRegistry({
        'test-sensor': {
          id: 'test-sensor',
          name: 'Test Sensor',
          deploy: {
            method: 'flash',
            provides: [],
            requires: [],
            flash: {
              files: ['main.py'],
              lib: [],
              shared_lib: [],
              prompt_message: 'Plug in sensor',
            },
          },
        },
      });

      const phase = new DeployPhase(
        hw as any,
        makeMockPortalService() as any,
        makeMockTeachingEngine() as any,
        registry as any,
      );

      const ctx = makeCtx({
        nuggetDir,
        session: {
          id: 's1', state: 'executing',
          spec: { devices: [{ pluginId: 'test-sensor', instanceId: 'i1', fields: {} }] },
          tasks: [], agents: [],
        },
      });

      const gateResolver = makeGateResolver();

      // Auto-resolve the gate when flash_prompt is sent
      (ctx.send as any).mockImplementation(async (event: any) => {
        if (event.type === 'flash_prompt' && gateResolver.current) {
          setTimeout(() => gateResolver.current?.({}), 0);
        }
      });

      await phase.deployDevices(ctx, gateResolver);

      // Should have called hardwareService methods (through MpremoteFlashStrategy)
      expect(hw.wipeBoard).toHaveBeenCalledOnce();
      expect(hw.flashFiles).toHaveBeenCalledOnce();
      expect(hw.resetBoard).toHaveBeenCalledOnce();
    });
  });

  describe('esptool method selects correct strategy', () => {
    it('sends flash_prompt and calls strategy for esptool device', async () => {
      const hw = makeMockHardwareService();
      const registry = makeMockDeviceRegistry({
        'box-3': {
          id: 'box-3',
          name: 'BOX-3',
          deploy: {
            method: 'esptool',
            provides: [],
            requires: [],
            esptool: {
              firmware_file: 'firmware.bin',
              flash_offset: '0x0',
              baud_rate: 460800,
              chip: 'esp32s3',
              prompt_message: 'Connect your BOX-3',
            },
          },
        },
      });

      const phase = new DeployPhase(
        hw as any,
        makeMockPortalService() as any,
        makeMockTeachingEngine() as any,
        registry as any,
      );

      const ctx = makeCtx({
        session: {
          id: 's1', state: 'executing',
          spec: { devices: [{ pluginId: 'box-3', instanceId: 'b1', fields: {} }] },
          tasks: [], agents: [],
        },
      });

      const gateResolver = makeGateResolver();
      (ctx.send as any).mockImplementation(async (event: any) => {
        if (event.type === 'flash_prompt' && gateResolver.current) {
          setTimeout(() => gateResolver.current?.({}), 0);
        }
      });

      await phase.deployDevices(ctx, gateResolver);

      // flash_prompt should have been sent with the esptool prompt message
      const promptCalls = (ctx.send as any).mock.calls.filter(
        (c: any[]) => c[0].type === 'flash_prompt',
      );
      expect(promptCalls.length).toBe(1);
      expect(promptCalls[0][0].message).toBe('Connect your BOX-3');

      // flash_complete should have been sent (stub returns failure, which is expected)
      const completeCalls = (ctx.send as any).mock.calls.filter(
        (c: any[]) => c[0].type === 'flash_complete',
      );
      expect(completeCalls.length).toBe(1);
    });
  });

  describe('runtime provisioning', () => {
    it('runs provisioner before device flash when required', async () => {
      const hw = makeMockHardwareService();
      const nuggetDir = makeTempDir();
      tmpDirs.push(nuggetDir);

      const provisioner = makeMockProvisioner();
      const callOrder: string[] = [];

      (provisioner.provision as any).mockImplementation(async () => {
        callOrder.push('provision');
        return { agent_id: 'a1', api_key: 'k1', runtime_url: 'http://rt:9000' };
      });
      hw.flashFiles.mockImplementation(async () => {
        callOrder.push('flash');
        return { success: true, message: 'OK' };
      });

      const registry = makeMockDeviceRegistry({
        'box-3': {
          id: 'box-3',
          name: 'BOX-3',
          deploy: {
            method: 'flash',
            provides: [],
            requires: ['agent_id', 'api_key'],
            flash: {
              files: ['main.py'],
              lib: [],
              shared_lib: [],
              prompt_message: 'Plug in',
            },
            runtime_provision: {
              required: true,
              config_fields: ['personality'],
            },
          },
        },
      });

      const phase = new DeployPhase(
        hw as any,
        makeMockPortalService() as any,
        makeMockTeachingEngine() as any,
        registry as any,
        provisioner,
      );

      const ctx = makeCtx({
        nuggetDir,
        session: {
          id: 's1', state: 'executing',
          spec: { devices: [{ pluginId: 'box-3', instanceId: 'b1', fields: {} }] },
          tasks: [], agents: [],
        },
      });

      const gateResolver = makeGateResolver();
      (ctx.send as any).mockImplementation(async (event: any) => {
        if (event.type === 'flash_prompt' && gateResolver.current) {
          setTimeout(() => gateResolver.current?.({}), 0);
        }
      });

      await phase.deployDevices(ctx, gateResolver);

      // Provision should run BEFORE flash
      expect(callOrder).toEqual(['provision', 'flash']);
      expect(provisioner.provision).toHaveBeenCalledOnce();
    });

    it('provision results flow into device flash as injections', async () => {
      const hw = makeMockHardwareService();
      const nuggetDir = makeTempDir();
      tmpDirs.push(nuggetDir);

      hw.flashFiles.mockImplementation(async (...args: any[]) => {
        return { success: true, message: 'OK' };
      });

      const provisioner = makeMockProvisioner();

      const registry = makeMockDeviceRegistry({
        'box-3': {
          id: 'box-3',
          name: 'BOX-3',
          deploy: {
            method: 'flash',
            provides: [],
            requires: ['agent_id', 'api_key', 'runtime_url'],
            flash: {
              files: ['main.py'],
              lib: [],
              shared_lib: [],
              prompt_message: 'Plug in',
            },
            runtime_provision: { required: true, config_fields: [] },
          },
        },
      });

      const phase = new DeployPhase(
        hw as any,
        makeMockPortalService() as any,
        makeMockTeachingEngine() as any,
        registry as any,
        provisioner,
      );

      const ctx = makeCtx({
        nuggetDir,
        session: {
          id: 's1', state: 'executing',
          spec: { devices: [{ pluginId: 'box-3', instanceId: 'b1', fields: {} }] },
          tasks: [], agents: [],
        },
      });

      const gateResolver = makeGateResolver();
      (ctx.send as any).mockImplementation(async (event: any) => {
        if (event.type === 'flash_prompt' && gateResolver.current) {
          setTimeout(() => gateResolver.current?.({}), 0);
        }
      });

      await phase.deployDevices(ctx, gateResolver);

      // Flash should have received config.py (from injected runtime provisioning output)
      const flashCall = hw.flashFiles.mock.calls[0] as any[];
      const files = flashCall[1] as string[];
      expect(files).toContain('config.py');
    });

    it('skips provisioning when no device requires it', async () => {
      const hw = makeMockHardwareService();
      const nuggetDir = makeTempDir();
      tmpDirs.push(nuggetDir);
      const provisioner = makeMockProvisioner();

      const registry = makeMockDeviceRegistry({
        'sensor': {
          id: 'sensor',
          name: 'Sensor',
          deploy: {
            method: 'flash',
            provides: [],
            requires: [],
            flash: {
              files: ['main.py'],
              lib: [],
              shared_lib: [],
              prompt_message: 'Plug in',
            },
            // No runtime_provision field
          },
        },
      });

      const phase = new DeployPhase(
        hw as any,
        makeMockPortalService() as any,
        makeMockTeachingEngine() as any,
        registry as any,
        provisioner,
      );

      const ctx = makeCtx({
        nuggetDir,
        session: {
          id: 's1', state: 'executing',
          spec: { devices: [{ pluginId: 'sensor', instanceId: 'i1', fields: {} }] },
          tasks: [], agents: [],
        },
      });

      const gateResolver = makeGateResolver();
      (ctx.send as any).mockImplementation(async (event: any) => {
        if (event.type === 'flash_prompt' && gateResolver.current) {
          setTimeout(() => gateResolver.current?.({}), 0);
        }
      });

      await phase.deployDevices(ctx, gateResolver);

      expect(provisioner.provision).not.toHaveBeenCalled();
    });

    it('handles provisioning failure gracefully', async () => {
      const hw = makeMockHardwareService();
      const nuggetDir = makeTempDir();
      tmpDirs.push(nuggetDir);
      const provisioner = makeMockProvisioner({
        provision: vi.fn(async () => { throw new Error('Runtime unreachable'); }),
      });

      const registry = makeMockDeviceRegistry({
        'box-3': {
          id: 'box-3',
          name: 'BOX-3',
          deploy: {
            method: 'flash',
            provides: [],
            requires: [],
            flash: {
              files: ['main.py'],
              lib: [],
              shared_lib: [],
              prompt_message: 'Plug in',
            },
            runtime_provision: { required: true, config_fields: [] },
          },
        },
      });

      const phase = new DeployPhase(
        hw as any,
        makeMockPortalService() as any,
        makeMockTeachingEngine() as any,
        registry as any,
        provisioner,
      );

      const ctx = makeCtx({
        nuggetDir,
        session: {
          id: 's1', state: 'executing',
          spec: { devices: [{ pluginId: 'box-3', instanceId: 'b1', fields: {} }] },
          tasks: [], agents: [],
        },
      });

      const gateResolver = makeGateResolver();
      (ctx.send as any).mockImplementation(async (event: any) => {
        if (event.type === 'flash_prompt' && gateResolver.current) {
          setTimeout(() => gateResolver.current?.({}), 0);
        }
      });

      // Should not throw, just send error event
      await phase.deployDevices(ctx, gateResolver);

      const errorCalls = (ctx.send as any).mock.calls.filter(
        (c: any[]) => c[0].type === 'error',
      );
      expect(errorCalls.length).toBeGreaterThanOrEqual(1);
      expect(errorCalls[0][0].message).toContain('Runtime unreachable');
    });
  });

  describe('deploy order with provisioning', () => {
    it('provisioning runs first when device requires runtime outputs', async () => {
      const hw = makeMockHardwareService();
      const nuggetDir = makeTempDir();
      tmpDirs.push(nuggetDir);

      const provisioner = makeMockProvisioner();
      const callOrder: string[] = [];

      (provisioner.provision as any).mockImplementation(async () => {
        callOrder.push('provision');
        return { agent_id: 'a1', api_key: 'k1', runtime_url: 'http://rt:9000' };
      });

      hw.flashFiles.mockImplementation(async () => {
        callOrder.push('flash');
        return { success: true, message: 'OK' };
      });

      const registry = makeMockDeviceRegistry({
        'gateway': {
          id: 'gateway',
          name: 'Gateway',
          deploy: {
            method: 'flash',
            provides: [],
            requires: ['agent_id'],
            flash: {
              files: ['main.py'],
              lib: [],
              shared_lib: [],
              prompt_message: 'Plug in gateway',
            },
            runtime_provision: { required: true, config_fields: [] },
          },
        },
      });

      const phase = new DeployPhase(
        hw as any,
        makeMockPortalService() as any,
        makeMockTeachingEngine() as any,
        registry as any,
        provisioner,
      );

      const ctx = makeCtx({
        nuggetDir,
        session: {
          id: 's1', state: 'executing',
          spec: { devices: [{ pluginId: 'gateway', instanceId: 'g1', fields: {} }] },
          tasks: [], agents: [],
        },
      });

      const gateResolver = makeGateResolver();
      (ctx.send as any).mockImplementation(async (event: any) => {
        if (event.type === 'flash_prompt' && gateResolver.current) {
          setTimeout(() => gateResolver.current?.({}), 0);
        }
      });

      await phase.deployDevices(ctx, gateResolver);

      expect(callOrder[0]).toBe('provision');
      expect(callOrder[1]).toBe('flash');
    });
  });
});
