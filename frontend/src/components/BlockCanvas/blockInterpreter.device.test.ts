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

interface TestBlock { type: string; id: string; fields: Record<string, unknown>; next?: { block: TestBlock } }

function makeBlock(type: string, fields: Record<string, unknown> = {}, next?: TestBlock): TestBlock {
  const b: TestBlock = { type, id: `b_${type}_${Math.random().toString(36).slice(2)}`, fields };
  if (next) b.next = { block: next };
  return b;
}

function makeWorkspace(blocks: TestBlock[]): Record<string, unknown> {
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

describe('Deployment target inference from device manifest', () => {
  const flashManifest: DeviceManifest = {
    id: 'flash-device',
    name: 'Flash Device',
    version: '1.0.0',
    description: 'A device that deploys via flash',
    colour: 45,
    board: null,
    capabilities: [],
    blocks: [{
      type: 'flash_device_block',
      message: 'Flash Device %1',
      args: [{ type: 'input_dummy' }],
    }],
    deploy: { method: 'flash' },
  };

  const cloudManifest: DeviceManifest = {
    id: 'cloud-device',
    name: 'Cloud Device',
    version: '1.0.0',
    description: 'A device that deploys to cloud',
    colour: 210,
    board: null,
    capabilities: [],
    blocks: [{
      type: 'cloud_device_block',
      message: 'Cloud Device %1',
      args: [{ type: 'input_dummy' }],
    }],
    deploy: { method: 'cloud' },
  };

  const noMethodManifest: DeviceManifest = {
    id: 'no-method-device',
    name: 'No Method Device',
    version: '1.0.0',
    description: 'A device with no deploy method',
    colour: 90,
    board: null,
    capabilities: [],
    blocks: [{
      type: 'no_method_block',
      message: 'No Method %1',
      args: [{ type: 'input_dummy' }],
    }],
    deploy: {},
  };

  it('sets deployment target to esp32 for flash device', () => {
    const deviceBlock = makeBlock('flash_device_block', {});
    const goalBlock = makeBlock('nugget_goal', { GOAL_TEXT: 'test' }, deviceBlock);
    const ws = makeWorkspace([goalBlock]);
    const spec = interpretWorkspace(ws, [], [], [], [flashManifest]);
    expect(spec.deployment.target).toBe('esp32');
  });

  it('sets deployment target to web for cloud device', () => {
    const deviceBlock = makeBlock('cloud_device_block', {});
    const goalBlock = makeBlock('nugget_goal', { GOAL_TEXT: 'test' }, deviceBlock);
    const ws = makeWorkspace([goalBlock]);
    const spec = interpretWorkspace(ws, [], [], [], [cloudManifest]);
    expect(spec.deployment.target).toBe('web');
  });

  it('sets deployment target to both when flash + cloud devices combined', () => {
    const cloudBlock = makeBlock('cloud_device_block', {});
    const flashBlock = makeBlock('flash_device_block', {}, cloudBlock);
    const goalBlock = makeBlock('nugget_goal', { GOAL_TEXT: 'test' }, flashBlock);
    const ws = makeWorkspace([goalBlock]);
    const spec = interpretWorkspace(ws, [], [], [], [flashManifest, cloudManifest]);
    expect(spec.deployment.target).toBe('both');
  });

  it('does not affect deployment target for devices without deploy method', () => {
    const deviceBlock = makeBlock('no_method_block', {});
    const goalBlock = makeBlock('nugget_goal', { GOAL_TEXT: 'test' }, deviceBlock);
    const ws = makeWorkspace([goalBlock]);
    const spec = interpretWorkspace(ws, [], [], [], [noMethodManifest]);
    expect(spec.deployment.target).toBe('preview');
  });
});
