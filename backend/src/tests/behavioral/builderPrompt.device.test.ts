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
      devices: [{ pluginId: 'heltec-sensor-node', instanceId: 'b1', fields: {} }],
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
