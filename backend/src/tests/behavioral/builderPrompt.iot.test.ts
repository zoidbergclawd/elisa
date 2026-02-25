/** Behavioral tests for IoT hardware context in builder agent prompts.
 *
 * Covers:
 * - IoT sensor API reference injected when spec.hardware.devices is present
 * - Pin mapping table included for Heltec WiFi LoRa V3
 * - Non-IoT specs do not receive IoT context
 */

import { describe, it, expect } from 'vitest';
import { formatTaskPrompt } from '../../prompts/builderAgent.js';

describe('Builder prompt IoT context', () => {
  const iotSpec = {
    nugget: { goal: 'IoT sensor network', description: 'Temp + humidity + motion' },
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
      ],
    },
  };

  it('includes IoT sensor API reference when hardware.devices present', () => {
    const prompt = formatTaskPrompt({
      agentName: 'Builder Bot',
      role: 'builder',
      persona: 'a careful coder',
      task: { id: 't1', name: 'Build sensor node', description: 'Create sensor_main.py' },
      spec: iotSpec,
      predecessors: [],
      style: {},
    });
    expect(prompt).toContain('DHT22Sensor');
    expect(prompt).toContain('ReedSwitch');
    expect(prompt).toContain('PIRSensor');
    expect(prompt).toContain('OLEDDisplay');
    expect(prompt).toContain('SensorNode');
  });

  it('includes pin mapping table', () => {
    const prompt = formatTaskPrompt({
      agentName: 'Builder Bot',
      role: 'builder',
      persona: 'a careful coder',
      task: { id: 't1', name: 'Build sensor node', description: 'Create sensor_main.py' },
      spec: iotSpec,
      predecessors: [],
      style: {},
    });
    expect(prompt).toContain('GPIO 13');
    expect(prompt).toContain('GPIO 17');
    expect(prompt).toContain('GPIO 18');
  });

  it('does not include IoT context for non-IoT specs', () => {
    const webSpec = {
      nugget: { goal: 'A website', description: 'Simple web page' },
      deployment: { target: 'web' },
    };
    const prompt = formatTaskPrompt({
      agentName: 'Builder Bot',
      role: 'builder',
      persona: 'a careful coder',
      task: { id: 't1', name: 'Build page', description: 'Create index.html' },
      spec: webSpec,
      predecessors: [],
      style: {},
    });
    expect(prompt).not.toContain('DHT22Sensor');
    expect(prompt).not.toContain('SensorNode');
  });
});
