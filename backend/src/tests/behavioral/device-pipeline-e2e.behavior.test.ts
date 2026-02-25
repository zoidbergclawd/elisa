/**
 * End-to-end validation of the device plugin pipeline.
 * Exercises: NuggetSpecSchema validation, formatTaskPrompt with deviceRegistry,
 * resolveDeployOrder, and shouldDeployDevices.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { NuggetSpecSchema } from '../../utils/specValidator.js';
import { formatTaskPrompt } from '../../prompts/builderAgent.js';
import { resolveDeployOrder } from '../../services/phases/deployOrder.js';
import { DeviceRegistry } from '../../services/deviceRegistry.js';
import { DeployPhase } from '../../services/phases/deployPhase.js';

const devicesDir = path.resolve(import.meta.dirname, '../../../../devices');

describe('Device plugin pipeline E2E', () => {
  const spec = {
    nugget: { goal: 'IoT sensor network', type: 'hardware', description: 'Multi-device sensor network' },
    requirements: [{ type: 'feature', description: 'Read temperature sensor' }],
    agents: [{ name: 'HW Dev', role: 'builder', persona: 'embedded expert' }],
    deployment: { target: 'esp32', auto_flash: true },
    workflow: { review_enabled: false, testing_enabled: false, human_gates: [] },
    devices: [
      { pluginId: 'heltec-sensor-node', instanceId: 'sensor-1', fields: { SENSOR_TYPE: 'DHT22' } },
      { pluginId: 'heltec-gateway', instanceId: 'gateway-1', fields: {} },
    ],
  };

  it('Stage 1: NuggetSpecSchema validates spec with devices', () => {
    const result = NuggetSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it('Stage 2: formatTaskPrompt includes device context from plugin', () => {
    const registry = new DeviceRegistry(devicesDir);
    const prompt = formatTaskPrompt({
      agentName: 'HW Dev',
      role: 'builder',
      persona: 'embedded expert',
      task: { name: 'Build sensor', description: 'Implement sensor reading' },
      spec,
      predecessors: [],
      deviceRegistry: registry,
    });

    // Should include agent context from heltec-sensor-node plugin
    expect(prompt).toContain('heltec-sensor-node');
    // Should include content from the plugin's agent-context.md
    expect(prompt).toContain('Device: heltec-sensor-node');
  });

  it('Stage 3: resolveDeployOrder produces correct ordering', () => {
    const registry = new DeviceRegistry(devicesDir);
    const manifests = new Map(
      registry.getAllDevices().map(d => [d.id, d]),
    );

    const ordered = resolveDeployOrder(spec.devices, manifests);

    // Sensor node provides sensor_data, gateway requires it → sensor first
    const sensorIdx = ordered.findIndex(d => d.pluginId === 'heltec-sensor-node');
    const gatewayIdx = ordered.findIndex(d => d.pluginId === 'heltec-gateway');
    expect(sensorIdx).toBeGreaterThanOrEqual(0);
    expect(gatewayIdx).toBeGreaterThanOrEqual(0);
    expect(sensorIdx).toBeLessThan(gatewayIdx);
  });

  it('Stage 4: shouldDeployDevices returns true for spec with devices', () => {
    const phase = new DeployPhase({} as any, {} as any, {} as any);
    const ctx = { session: { spec } } as any;
    expect(phase.shouldDeployDevices(ctx)).toBe(true);
  });

  it('Stage 4b: shouldDeployDevices returns false without devices', () => {
    const phase = new DeployPhase({} as any, {} as any, {} as any);
    const noDevicesSpec = { ...spec, devices: undefined };
    const ctx = { session: { spec: noDevicesSpec } } as any;
    expect(phase.shouldDeployDevices(ctx)).toBe(false);
  });
});
