import { describe, it, expect, beforeEach } from 'vitest';
import { NuggetSpecSchema } from '../../utils/specValidator.js';
import fs from 'node:fs';
import path from 'node:path';

describe('IoT build session behavior', () => {
  const fixturePath = path.resolve(import.meta.dirname, '../fixtures/specs/iot-sensor-network.json');

  let iotSpec: any;

  beforeEach(() => {
    iotSpec = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
  });

  it('IoT fixture passes Zod validation', () => {
    const result = NuggetSpecSchema.safeParse(iotSpec);
    expect(result.success).toBe(true);
  });

  it('fixture has both sensor_node and gateway_node devices', () => {
    expect(iotSpec.hardware.devices).toHaveLength(2);
    const roles = iotSpec.hardware.devices.map((d: any) => d.role);
    expect(roles).toContain('sensor_node');
    expect(roles).toContain('gateway_node');
  });

  it('sensor node has all three sensor types', () => {
    const sensorNode = iotSpec.hardware.devices.find((d: any) => d.role === 'sensor_node');
    expect(sensorNode.sensors).toContain('dht22');
    expect(sensorNode.sensors).toContain('reed_switch');
    expect(sensorNode.sensors).toContain('pir');
  });

  it('sensor and gateway share the same LoRa channel', () => {
    const channels = iotSpec.hardware.devices.map((d: any) => d.lora.channel);
    expect(new Set(channels).size).toBe(1); // All same channel
  });

  it('cloud config specifies cloud_run platform', () => {
    expect(iotSpec.hardware.cloud.platform).toBe('cloud_run');
    expect(iotSpec.hardware.cloud.project).toBeTruthy();
  });

  it('documentation config requests generation', () => {
    expect(iotSpec.documentation.generate).toBe(true);
    expect(iotSpec.documentation.focus).toBe('all');
  });

  it('deployment target is iot', () => {
    expect(iotSpec.deployment.target).toBe('iot');
  });

  it('has functional requirements for all sensor types', () => {
    const descriptions = iotSpec.requirements.map((r: any) =>
      typeof r === 'string' ? r : r.description
    );
    expect(descriptions.some((d: string) => d.includes('temperature'))).toBe(true);
    expect(descriptions.some((d: string) => d.includes('door') || d.includes('open'))).toBe(true);
    expect(descriptions.some((d: string) => d.includes('motion'))).toBe(true);
  });
});
