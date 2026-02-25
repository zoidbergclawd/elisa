import { describe, it, expect, vi } from 'vitest';
import { formatTaskPrompt } from '../../prompts/builderAgent.js';

describe('Builder prompt device plugin context', () => {
  it('injects agent context from device registry for each device in spec', () => {
    const mockRegistry = {
      getAgentContext: vi.fn((id: string) => {
        if (id === 'heltec-sensor-node') return '# Sensor API\nDHT22Sensor(pin)';
        return '';
      }),
    };

    const spec = {
      nugget: { goal: 'IoT', description: 'test' },
      devices: [{ pluginId: 'heltec-sensor-node', instanceId: 'b1', fields: {
        SENSOR_DHT22: true,
        PIN_DHT22: 26,
        SENSOR_REED: true,
        PIN_REED: 33,
      } }],
    };

    const prompt = formatTaskPrompt({
      agentName: 'Builder',
      role: 'builder',
      persona: 'coder',
      task: { id: 't1', name: 'Build', description: 'code' },
      spec,
      predecessors: [],
      style: {},
      deviceRegistry: mockRegistry as any,
    });

    expect(prompt).toContain('DHT22Sensor');
    expect(prompt).toContain('Device Instance: heltec-sensor-node');
    expect(prompt).toContain('PIN_DHT22: 26');
    expect(prompt).toContain('PIN_REED: 33');
    expect(mockRegistry.getAgentContext).toHaveBeenCalledWith('heltec-sensor-node');
  });

  it('does not inject device context when no devices in spec', () => {
    const mockRegistry = { getAgentContext: vi.fn() };
    const spec = { nugget: { goal: 'web', description: 'test' } };

    formatTaskPrompt({
      agentName: 'Builder',
      role: 'builder',
      persona: 'coder',
      task: { id: 't1', name: 'Build', description: 'code' },
      spec,
      predecessors: [],
      style: {},
      deviceRegistry: mockRegistry as any,
    });

    expect(mockRegistry.getAgentContext).not.toHaveBeenCalled();
  });

  it('deduplicates device context for same plugin used multiple times', () => {
    const mockRegistry = {
      getAgentContext: vi.fn(() => '# Sensor API'),
    };

    const spec = {
      nugget: { goal: 'IoT', description: 'test' },
      devices: [
        { pluginId: 'heltec-sensor-node', instanceId: 'b1', fields: {} },
        { pluginId: 'heltec-sensor-node', instanceId: 'b2', fields: {} },
      ],
    };

    formatTaskPrompt({
      agentName: 'Builder',
      role: 'builder',
      persona: 'coder',
      task: { id: 't1', name: 'Build', description: 'code' },
      spec,
      predecessors: [],
      style: {},
      deviceRegistry: mockRegistry as any,
    });

    expect(mockRegistry.getAgentContext).toHaveBeenCalledTimes(1);
  });
});
