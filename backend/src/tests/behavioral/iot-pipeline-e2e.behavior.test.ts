/** End-to-end validation of the IoT NuggetSpec pipeline.
 *
 * Verifies that a NuggetSpec produced by the block interpreter
 * passes through all four stages:
 *   1. Blockly blocks -> NuggetSpec JSON (via interpretWorkspace)
 *   2. NuggetSpec passes Zod validation
 *   3. Builder prompt includes IoT hardware context
 *   4. Deploy phase recognizes target: 'iot' and routes to deployIoT()
 */

import { describe, it, expect, vi } from 'vitest';
import { NuggetSpecSchema } from '../../utils/specValidator.js';
import { formatTaskPrompt } from '../../prompts/builderAgent.js';

// Mock child_process to prevent real subprocesses (required by deployPhase)
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

vi.mock('../../services/cloudDeployService.js', () => ({
  CloudDeployService: class {
    deploy = vi.fn().mockResolvedValue({ url: 'https://test.run.app', apiKey: 'k' });
  },
}));

describe('IoT NuggetSpec end-to-end pipeline', () => {
  // Stage 1: Simulate the NuggetSpec that interpretWorkspace produces
  // when a user builds an IoT workspace with all block types.
  // (The frontend interpreter tests validate the block->spec transformation;
  // here we use the resulting shape to drive the backend pipeline.)
  const iotSpec = {
    nugget: {
      goal: 'IoT sensor network with cloud dashboard',
      description: 'Sensor node reads DHT22, reed switch, PIR. Sends over LoRa to gateway.',
    },
    requirements: [
      { type: 'functional', description: 'Read temperature and humidity every 10 seconds' },
      { type: 'functional', description: 'Detect door open/close events' },
      { type: 'functional', description: 'Detect motion events' },
      { type: 'functional', description: 'Display readings on OLED' },
      { type: 'functional', description: 'Send data over LoRa channel 1' },
      { type: 'functional', description: 'Gateway receives LoRa and POSTs to cloud' },
    ],
    deployment: { target: 'iot' },
    hardware: {
      devices: [
        {
          role: 'sensor_node',
          board: 'heltec_lora_v3',
          sensors: ['dht22', 'reed_switch', 'pir'],
          display: 'oled_ssd1306',
          lora: { channel: 1 },
        },
        {
          role: 'gateway_node',
          board: 'heltec_lora_v3',
          lora: { channel: 1 },
        },
      ],
      cloud: {
        platform: 'cloud_run',
        project: 'elisa-iot-test',
        region: 'us-central1',
      },
    },
    documentation: {
      generate: true,
      focus: 'all',
    },
  };

  // --- Stage 2: Zod validation ---
  it('IoT NuggetSpec passes Zod validation', () => {
    const result = NuggetSpecSchema.safeParse(iotSpec);
    expect(result.success).toBe(true);
  });

  it('rejects malformed IoT spec (missing required device fields)', () => {
    const badSpec = {
      ...iotSpec,
      hardware: {
        devices: [{ role: 'sensor_node' }], // missing board, lora
      },
    };
    const result = NuggetSpecSchema.safeParse(badSpec);
    expect(result.success).toBe(false);
  });

  // --- Stage 3: Builder prompt includes IoT context ---
  it('builder prompt includes IoT hardware API reference for validated spec', () => {
    const prompt = formatTaskPrompt({
      agentName: 'Builder Bot',
      role: 'builder',
      persona: 'a careful embedded systems coder',
      task: { id: 't1', name: 'Build sensor node', description: 'Create sensor_main.py' },
      spec: iotSpec,
      predecessors: [],
      style: {},
    });

    // Sensor class references
    expect(prompt).toContain('DHT22Sensor');
    expect(prompt).toContain('ReedSwitch');
    expect(prompt).toContain('PIRSensor');
    expect(prompt).toContain('OLEDDisplay');

    // Node orchestration classes
    expect(prompt).toContain('SensorNode');
    expect(prompt).toContain('GatewayNode');

    // Pin mapping
    expect(prompt).toContain('GPIO 13');  // DHT22
    expect(prompt).toContain('GPIO 17');  // OLED SDA
    expect(prompt).toContain('GPIO 18');  // OLED SCL

    // Code generation rules
    expect(prompt).toContain('sensor_main.py');
    expect(prompt).toContain('gateway_main.py');
  });

  it('builder prompt does NOT include IoT context for non-IoT spec', () => {
    const webSpec = {
      nugget: { goal: 'A website', description: 'Simple page' },
      deployment: { target: 'web' },
    };
    const prompt = formatTaskPrompt({
      agentName: 'Builder Bot',
      role: 'builder',
      persona: 'a web developer',
      task: { id: 't1', name: 'Build page', description: 'Create index.html' },
      spec: webSpec,
      predecessors: [],
      style: {},
    });
    expect(prompt).not.toContain('DHT22Sensor');
    expect(prompt).not.toContain('SensorNode');
    expect(prompt).not.toContain('GPIO 13');
  });

  // --- Stage 4: Deploy phase routing ---
  it('deploy phase recognizes iot target and routes to deployIoT()', async () => {
    const { DeployPhase } = await import('../../services/phases/deployPhase.js');
    const deploy = new DeployPhase({
      compile: vi.fn(),
      flash: vi.fn(),
      flashFiles: vi.fn().mockResolvedValue({ success: true }),
      detect: vi.fn(),
      startMonitor: vi.fn(),
      stopMonitor: vi.fn(),
    } as any);

    // Build a minimal PhaseContext
    const events: any[] = [];
    const ctx = {
      session: {
        id: 'test-session',
        spec: iotSpec,
        workspace: '/tmp/test-iot',
        agents: [],
      },
      send: vi.fn((e: any) => { events.push(e); }),
      signal: new AbortController().signal,
    } as any;

    expect(deploy.shouldDeployIoT(ctx)).toBe(true);

    // Verify non-IoT specs are rejected
    const webCtx = {
      ...ctx,
      session: { ...ctx.session, spec: { deployment: { target: 'web' } } },
    };
    expect(deploy.shouldDeployIoT(webCtx)).toBe(false);

    // Verify preview (default) is rejected
    const defaultCtx = {
      ...ctx,
      session: { ...ctx.session, spec: {} },
    };
    expect(deploy.shouldDeployIoT(defaultCtx)).toBe(false);
  });

  // --- Cross-stage: full pipeline coherence ---
  it('spec produced by interpreter shape validates and drives all backend stages', () => {
    // Stage 2: Validates
    const result = NuggetSpecSchema.safeParse(iotSpec);
    expect(result.success).toBe(true);

    // Stage 3: Drives prompt generation
    const prompt = formatTaskPrompt({
      agentName: 'Builder Bot',
      role: 'builder',
      persona: 'embedded systems expert',
      task: { id: 't1', name: 'Build sensor', description: 'sensor_main.py' },
      spec: result.data!,
      predecessors: [],
      style: {},
    });
    expect(prompt).toContain('DHT22Sensor');
    expect(prompt).toContain('SensorNode');

    // Stage 4: Routes to IoT deploy
    const target = result.data!.deployment?.target ?? 'preview';
    expect(target).toBe('iot');

    // Verify hardware devices are present for flash wizard
    expect(result.data!.hardware?.devices).toHaveLength(2);
    const roles = result.data!.hardware!.devices.map(d => d.role);
    expect(roles).toContain('sensor_node');
    expect(roles).toContain('gateway_node');
  });
});
