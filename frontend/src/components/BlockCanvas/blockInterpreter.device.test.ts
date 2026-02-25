import { describe, it, expect } from 'vitest';
import { interpretWorkspace } from './blockInterpreter';
import type { DeviceManifest } from '../../lib/deviceBlocks';

const mockManifests: DeviceManifest[] = [
  {
    id: 'test-sensor',
    name: 'Test Sensor',
    version: '1.0.0',
    description: 'A test sensor',
    colour: 45,
    board: null,
    capabilities: [],
    blocks: [{
      type: 'test_sensor',
      message: 'Sensor %1 %2',
      args: [{ type: 'input_dummy' }, { type: 'field_checkbox', name: 'ENABLED' }],
    }],
    deploy: {},
  },
  {
    id: 'test-cloud',
    name: 'Test Cloud',
    version: '1.0.0',
    description: 'A test cloud',
    colour: 180,
    board: null,
    capabilities: [],
    blocks: [{
      type: 'test_cloud',
      message: 'Cloud %1 %2',
      args: [{ type: 'input_dummy' }, { type: 'field_input', name: 'PROJECT' }],
    }],
    deploy: {},
  },
];

function makeBlock(type: string, fields: Record<string, unknown> = {}, next?: any): any {
  const b: any = { type, id: `b_${type}_${Math.random().toString(36).slice(2)}`, fields };
  if (next) b.next = { block: next };
  return b;
}

function makeWorkspace(blocks: any[]): any {
  return { blocks: { blocks } };
}

describe('Device block interpretation', () => {
  it('recognizes block from loaded manifest and adds to spec.devices', () => {
    const sensorBlock = makeBlock('test_sensor', { ENABLED: true });
    const goalBlock = makeBlock('nugget_goal', { GOAL_TEXT: 'test' }, sensorBlock);
    const ws = makeWorkspace([goalBlock]);
    const spec = interpretWorkspace(ws, [], [], [], mockManifests);
    expect(spec.devices).toHaveLength(1);
    expect(spec.devices![0].pluginId).toBe('test-sensor');
    expect(spec.devices![0].fields.ENABLED).toBe(true);
  });

  it('handles multiple device blocks from different plugins', () => {
    const cloudBlock = makeBlock('test_cloud', { PROJECT: 'my-proj' });
    const sensorBlock = makeBlock('test_sensor', { ENABLED: true }, cloudBlock);
    const goalBlock = makeBlock('nugget_goal', { GOAL_TEXT: 'test' }, sensorBlock);
    const ws = makeWorkspace([goalBlock]);
    const spec = interpretWorkspace(ws, [], [], [], mockManifests);
    expect(spec.devices).toHaveLength(2);
    expect(spec.devices![0].pluginId).toBe('test-sensor');
    expect(spec.devices![1].pluginId).toBe('test-cloud');
  });

  it('ignores blocks that do not match any manifest', () => {
    const unknownBlock = makeBlock('unknown_device', { X: 1 });
    const goalBlock = makeBlock('nugget_goal', { GOAL_TEXT: 'test' }, unknownBlock);
    const ws = makeWorkspace([goalBlock]);
    const spec = interpretWorkspace(ws, [], [], [], mockManifests);
    expect(spec.devices ?? []).toHaveLength(0);
  });
});
