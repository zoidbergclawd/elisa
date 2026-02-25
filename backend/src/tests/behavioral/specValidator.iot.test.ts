import { describe, it, expect } from 'vitest';
import { NuggetSpecSchema } from '../../utils/specValidator.js';

describe('NuggetSpecSchema IoT hardware config', () => {
  const baseSpec = {
    nugget: { goal: 'IoT sensor network', description: 'Sensor node with gateway' },
    deployment: { target: 'iot' },
  };

  it('accepts valid IoT hardware config with sensor node and gateway', () => {
    const spec = {
      ...baseSpec,
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
          project: 'my-project',
          region: 'us-central1',
        },
      },
    };
    const result = NuggetSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it('rejects unknown sensor type', () => {
    const spec = {
      ...baseSpec,
      hardware: {
        devices: [{
          role: 'sensor_node',
          board: 'heltec_lora_v3',
          sensors: ['unknown_sensor'],
          lora: { channel: 1 },
        }],
      },
    };
    const result = NuggetSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
  });

  it('rejects unknown device role', () => {
    const spec = {
      ...baseSpec,
      hardware: {
        devices: [{
          role: 'unknown_role',
          board: 'heltec_lora_v3',
          lora: { channel: 1 },
        }],
      },
    };
    const result = NuggetSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
  });

  it('accepts iot deployment target', () => {
    const result = NuggetSpecSchema.safeParse(baseSpec);
    expect(result.success).toBe(true);
  });

  it('accepts documentation config', () => {
    const spec = {
      ...baseSpec,
      documentation: { generate: true, focus: 'all' },
    };
    const result = NuggetSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it('rejects invalid documentation focus', () => {
    const spec = {
      ...baseSpec,
      documentation: { generate: true, focus: 'invalid_focus' },
    };
    const result = NuggetSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
  });
});
