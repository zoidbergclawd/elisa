/** Tests for DeployPhase IoT deployment: shouldDeployIoT(), deployIoT(). */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { PhaseContext } from '../../services/phases/types.js';
import type { BuildSession } from '../../models/session.js';

// Mock child_process to prevent real subprocesses
vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>();
  return {
    ...original,
    execFile: vi.fn((_cmd: string, _args: string[], _opts: any, cb: any) => {
      if (cb) cb(null, '', '');
      return { on: vi.fn(), stdout: null, stderr: null, pid: 99999, kill: vi.fn() };
    }),
    spawn: vi.fn(() => {
      const { EventEmitter } = require('node:events');
      const proc = new EventEmitter() as any;
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.pid = 99999;
      proc.kill = vi.fn();
      return proc;
    }),
  };
});

// Mock CloudDeployService -- use a shared mock fn that tests can override
const mockCloudDeploy = vi.fn().mockResolvedValue({
  url: 'https://elisa-iot-dashboard-abc123.run.app',
  apiKey: 'test-api-key-hex',
});

vi.mock('../../services/cloudDeployService.js', () => {
  return {
    CloudDeployService: class MockCloudDeployService {
      deploy = (...args: any[]) => mockCloudDeploy(...args);
    },
  };
});

// Inline mock factories (matching existing deployPhase.web.test.ts pattern)
function makeMockHardwareService() {
  return {
    compile: vi.fn().mockResolvedValue({ success: true, errors: [] }),
    flash: vi.fn().mockResolvedValue({ success: true, message: 'OK' }),
    flashFiles: vi.fn().mockResolvedValue({ success: true }),
    detectBoard: vi.fn().mockResolvedValue(null),
    startSerialMonitor: vi.fn().mockResolvedValue({ close: vi.fn() }),
  } as any;
}

function makeMockPortalService() {
  return {
    initializePortals: vi.fn().mockResolvedValue(undefined),
    hasSerialPortals: vi.fn().mockReturnValue(false),
    getCliPortals: vi.fn().mockReturnValue([]),
    getMcpServers: vi.fn().mockReturnValue([]),
    teardownAll: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function makeMockTeachingEngine() {
  return {
    getMoment: vi.fn().mockResolvedValue(null),
  } as any;
}

function makeCtx(overrides: Partial<BuildSession> = {}): { ctx: PhaseContext; events: any[] } {
  const events: any[] = [];
  const session: BuildSession = {
    id: 'test-session',
    state: 'executing',
    spec: overrides.spec ?? {},
    tasks: [],
    agents: [],
    ...overrides,
  } as BuildSession;
  const ctx: PhaseContext = {
    session,
    send: vi.fn(async (evt: any) => { events.push(evt); }),
    logger: null,
    nuggetDir: path.join(os.tmpdir(), `elisa-deploy-iot-test-${Date.now()}`),
    nuggetType: 'iot',
    abortSignal: new AbortController().signal,
  };
  return { ctx, events };
}

// Import after mocks
import { DeployPhase } from '../../services/phases/deployPhase.js';

describe('DeployPhase - shouldDeployIoT', () => {
  let phase: DeployPhase;

  beforeEach(() => {
    phase = new DeployPhase(makeMockHardwareService(), makeMockPortalService(), makeMockTeachingEngine());
  });

  it('returns true when target is "iot"', () => {
    const { ctx } = makeCtx({ spec: { deployment: { target: 'iot' } } });
    expect(phase.shouldDeployIoT(ctx)).toBe(true);
  });

  it('returns false when target is "web"', () => {
    const { ctx } = makeCtx({ spec: { deployment: { target: 'web' } } });
    expect(phase.shouldDeployIoT(ctx)).toBe(false);
  });

  it('returns false when target is "esp32"', () => {
    const { ctx } = makeCtx({ spec: { deployment: { target: 'esp32' } } });
    expect(phase.shouldDeployIoT(ctx)).toBe(false);
  });

  it('returns false when target is "preview" (default)', () => {
    const { ctx } = makeCtx({ spec: {} });
    expect(phase.shouldDeployIoT(ctx)).toBe(false);
  });
});

describe('DeployPhase - deployIoT', () => {
  let phase: DeployPhase;
  let mockHw: ReturnType<typeof makeMockHardwareService>;
  let tmpDir: string;

  beforeEach(() => {
    mockHw = makeMockHardwareService();
    phase = new DeployPhase(mockHw, makeMockPortalService(), makeMockTeachingEngine());
    tmpDir = path.join(os.tmpdir(), `elisa-deploy-iot-test-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Windows: ignore EPERM
    }
  });

  it('returns early when no devices in spec', async () => {
    const { ctx, events } = makeCtx({
      spec: { deployment: { target: 'iot' }, hardware: {} },
    });
    ctx.nuggetDir = tmpDir;

    // Provide a gateResolver that auto-resolves
    const gateResolver = { current: null as any };
    await phase.deployIoT(ctx, gateResolver);

    // No deploy events should be emitted
    const started = events.find(e => e.type === 'deploy_started');
    expect(started).toBeUndefined();
  });

  it('deploys cloud first, then flashes each device', async () => {
    const { ctx, events } = makeCtx({
      spec: {
        deployment: { target: 'iot' },
        hardware: {
          cloud: { project: 'my-project', region: 'us-east1' },
          devices: [
            { role: 'sensor_node', board: 'esp32s3', sensors: ['dht22'] },
            { role: 'gateway_node', board: 'esp32s3', connectivity: ['wifi'] },
          ],
        },
      },
    });
    ctx.nuggetDir = tmpDir;

    // Auto-resolve gates when flash_prompt is emitted
    const gateResolver = { current: null as any };
    const sendOriginal = ctx.send;
    ctx.send = vi.fn(async (evt: any) => {
      await sendOriginal(evt);
      // Auto-resolve gate when a flash_prompt is emitted
      if (evt.type === 'flash_prompt' && gateResolver.current) {
        gateResolver.current({ approved: true });
        gateResolver.current = null;
      }
    });

    const deployPromise = phase.deployIoT(ctx, gateResolver);
    await deployPromise;

    // Cloud deploy events should come first
    const cloudStarted = events.find(e => e.type === 'deploy_started' && e.target === 'cloud_dashboard');
    expect(cloudStarted).toBeDefined();

    const cloudComplete = events.find(e => e.type === 'deploy_complete' && e.target === 'cloud_dashboard');
    expect(cloudComplete).toBeDefined();
    expect(cloudComplete.url).toBe('https://elisa-iot-dashboard-abc123.run.app');

    // Flash prompt events emitted for each device
    const flashPrompts = events.filter(e => e.type === 'flash_prompt');
    expect(flashPrompts).toHaveLength(2);
    expect(flashPrompts[0].device_role).toBe('sensor_node');
    expect(flashPrompts[1].device_role).toBe('gateway_node');

    // flashFiles called for each device
    expect(mockHw.flashFiles).toHaveBeenCalledTimes(2);
  });

  it('emits flash_prompt events for each device', async () => {
    const { ctx, events } = makeCtx({
      spec: {
        deployment: { target: 'iot' },
        hardware: {
          devices: [
            { role: 'sensor_node', board: 'esp32s3', sensors: ['dht22'] },
          ],
        },
      },
    });
    ctx.nuggetDir = tmpDir;

    // Auto-resolve gates
    const gateResolver = { current: null as any };
    const sendOriginal = ctx.send;
    ctx.send = vi.fn(async (evt: any) => {
      await sendOriginal(evt);
      if (evt.type === 'flash_prompt' && gateResolver.current) {
        gateResolver.current({ approved: true });
        gateResolver.current = null;
      }
    });

    await phase.deployIoT(ctx, gateResolver);

    const flashPrompt = events.find(e => e.type === 'flash_prompt');
    expect(flashPrompt).toBeDefined();
    expect(flashPrompt.device_role).toBe('sensor_node');
    expect(flashPrompt.message).toContain('Sensor Node');
  });

  it('emits flash_complete with success for each device', async () => {
    const { ctx, events } = makeCtx({
      spec: {
        deployment: { target: 'iot' },
        hardware: {
          devices: [
            { role: 'sensor_node', board: 'esp32s3', sensors: ['dht22'] },
          ],
        },
      },
    });
    ctx.nuggetDir = tmpDir;

    const gateResolver = { current: null as any };
    const sendOriginal = ctx.send;
    ctx.send = vi.fn(async (evt: any) => {
      await sendOriginal(evt);
      if (evt.type === 'flash_prompt' && gateResolver.current) {
        gateResolver.current({ approved: true });
        gateResolver.current = null;
      }
    });

    await phase.deployIoT(ctx, gateResolver);

    const flashComplete = events.find(e => e.type === 'flash_complete');
    expect(flashComplete).toBeDefined();
    expect(flashComplete.device_role).toBe('sensor_node');
    expect(flashComplete.success).toBe(true);
  });

  it('handles flash failure gracefully', async () => {
    mockHw.flashFiles.mockResolvedValue({ success: false, message: 'Device not found' });

    const { ctx, events } = makeCtx({
      spec: {
        deployment: { target: 'iot' },
        hardware: {
          devices: [
            { role: 'sensor_node', board: 'esp32s3', sensors: ['dht22'] },
          ],
        },
      },
    });
    ctx.nuggetDir = tmpDir;

    const gateResolver = { current: null as any };
    const sendOriginal = ctx.send;
    ctx.send = vi.fn(async (evt: any) => {
      await sendOriginal(evt);
      if (evt.type === 'flash_prompt' && gateResolver.current) {
        gateResolver.current({ approved: true });
        gateResolver.current = null;
      }
    });

    await phase.deployIoT(ctx, gateResolver);

    const flashComplete = events.find(e => e.type === 'flash_complete');
    expect(flashComplete).toBeDefined();
    expect(flashComplete.success).toBe(false);
    expect(flashComplete.message).toBe('Device not found');
  });

  it('continues without cloud when cloud deploy fails', async () => {
    // Override the shared mock for this test: make deploy reject
    mockCloudDeploy.mockRejectedValueOnce(new Error('gcloud not found'));

    const { ctx, events } = makeCtx({
      spec: {
        deployment: { target: 'iot' },
        hardware: {
          cloud: { project: 'test', region: 'us-central1' },
          devices: [
            { role: 'sensor_node', board: 'esp32s3', sensors: ['dht22'] },
          ],
        },
      },
    });
    ctx.nuggetDir = tmpDir;

    const gateResolver = { current: null as any };
    const sendOriginal = ctx.send;
    ctx.send = vi.fn(async (evt: any) => {
      await sendOriginal(evt);
      if (evt.type === 'flash_prompt' && gateResolver.current) {
        gateResolver.current({ approved: true });
        gateResolver.current = null;
      }
    });

    await phase.deployIoT(ctx, gateResolver);

    // Should still have flash_prompt for the device even if cloud failed
    const flashPrompt = events.find(e => e.type === 'flash_prompt');
    expect(flashPrompt).toBeDefined();

    // Cloud failure logged as deploy_progress
    const cloudFail = events.find(e => e.type === 'deploy_progress' && e.step?.includes('Cloud deploy failed'));
    expect(cloudFail).toBeDefined();
  });

  it('passes correct file lists for sensor_node vs gateway_node', async () => {
    const { ctx } = makeCtx({
      spec: {
        deployment: { target: 'iot' },
        hardware: {
          devices: [
            { role: 'sensor_node', board: 'esp32s3', sensors: ['dht22'] },
            { role: 'gateway_node', board: 'esp32s3', connectivity: ['wifi'] },
          ],
        },
      },
    });
    ctx.nuggetDir = tmpDir;

    const gateResolver = { current: null as any };
    const sendOriginal = ctx.send;
    ctx.send = vi.fn(async (evt: any) => {
      await sendOriginal(evt);
      if (evt.type === 'flash_prompt' && gateResolver.current) {
        gateResolver.current({ approved: true });
        gateResolver.current = null;
      }
    });

    await phase.deployIoT(ctx, gateResolver);

    // First call: sensor_node files
    const sensorCall = mockHw.flashFiles.mock.calls[0];
    expect(sensorCall[1]).toEqual([
      'sensor_main.py', 'elisa_hardware.py', 'sensors.py', 'oled.py', 'nodes.py', 'ssd1306.py',
    ]);

    // Second call: gateway_node files
    const gatewayCall = mockHw.flashFiles.mock.calls[1];
    expect(gatewayCall[1]).toEqual([
      'gateway_main.py', 'elisa_hardware.py', 'nodes.py',
    ]);
  });
});
