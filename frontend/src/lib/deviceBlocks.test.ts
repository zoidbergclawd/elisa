import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DeviceManifest } from './deviceBlocks';

// Create a mock Blocks object we can inspect
const mockBlocks: Record<string, { init: () => void }> = {};

vi.mock('blockly', () => ({
  Blocks: new Proxy(mockBlocks, {
    get(target, prop) {
      return target[prop as string];
    },
    set(target, prop, value) {
      target[prop as string] = value;
      return true;
    },
  }),
}));

// Import after mock is set up
const { registerDeviceBlocks } = await import('./deviceBlocks');

function makeManifest(overrides: Partial<DeviceManifest> = {}): DeviceManifest {
  return {
    id: 'test-device',
    name: 'Test Device',
    version: '1.0.0',
    description: 'A test device',
    colour: 180,
    board: { type: 'esp32', variant: 's3', connection: 'usb', detection: { usb_vid: '0x1234' } },
    capabilities: [{ id: 'temp', name: 'Temperature', kind: 'sensor' }],
    blocks: [],
    deploy: {},
    ...overrides,
  };
}

describe('registerDeviceBlocks', () => {
  beforeEach(() => {
    // Clear any blocks registered in previous tests
    for (const key of Object.keys(mockBlocks)) {
      delete mockBlocks[key];
    }
  });

  it('registers blocks from a manifest', () => {
    const manifest = makeManifest({
      blocks: [
        {
          type: 'test_read_temp',
          message: 'read temperature from %1',
          args: [{ type: 'field_dropdown', name: 'SENSOR', options: [['A', 'a']] }],
          output: 'Number',
          tooltip: 'Reads temperature',
        },
      ],
    });

    registerDeviceBlocks([manifest]);

    expect(mockBlocks['test_read_temp']).toBeDefined();
    expect(typeof mockBlocks['test_read_temp'].init).toBe('function');
  });

  it('registers multiple blocks from a single manifest', () => {
    const manifest = makeManifest({
      blocks: [
        { type: 'device_block_a', message: 'block A', args: [] },
        { type: 'device_block_b', message: 'block B', args: [] },
      ],
    });

    registerDeviceBlocks([manifest]);

    expect(mockBlocks['device_block_a']).toBeDefined();
    expect(mockBlocks['device_block_b']).toBeDefined();
  });

  it('registers blocks from multiple manifests', () => {
    const m1 = makeManifest({
      id: 'device-1',
      colour: 100,
      blocks: [{ type: 'dev1_block', message: 'dev1', args: [] }],
    });
    const m2 = makeManifest({
      id: 'device-2',
      colour: 200,
      blocks: [{ type: 'dev2_block', message: 'dev2', args: [] }],
    });

    registerDeviceBlocks([m1, m2]);

    expect(mockBlocks['dev1_block']).toBeDefined();
    expect(mockBlocks['dev2_block']).toBeDefined();
  });

  it('does not re-register a block that already exists', () => {
    // Pre-register a block
    const existingInit = vi.fn();
    mockBlocks['existing_block'] = { init: existingInit };

    const manifest = makeManifest({
      blocks: [{ type: 'existing_block', message: 'new version', args: [] }],
    });

    registerDeviceBlocks([manifest]);

    // Should still be the original
    expect(mockBlocks['existing_block'].init).toBe(existingInit);
  });

  it('handles manifest with no blocks gracefully', () => {
    const manifest = makeManifest({ blocks: [] });

    // Should not throw
    registerDeviceBlocks([manifest]);
    expect(Object.keys(mockBlocks)).toHaveLength(0);
  });

  it('handles empty manifests array', () => {
    registerDeviceBlocks([]);
    expect(Object.keys(mockBlocks)).toHaveLength(0);
  });

  it('init function calls jsonInit with message0, args0, and manifest colour', () => {
    const jsonInitMock = vi.fn();
    const manifest = makeManifest({
      colour: 250,
      blocks: [
        {
          type: 'colour_block',
          message: 'do thing with %1',
          args: [{ type: 'input_value', name: 'VAL' }],
          previousStatement: true,
          nextStatement: true,
          tooltip: 'Does a thing',
        },
      ],
    });

    registerDeviceBlocks([manifest]);

    // Call the init function with a mock `this` context
    const blockThis = { jsonInit: jsonInitMock } as unknown as { jsonInit: (def: Record<string, unknown>) => void };
    mockBlocks['colour_block'].init.call(blockThis);

    expect(jsonInitMock).toHaveBeenCalledTimes(1);
    const arg = jsonInitMock.mock.calls[0][0];
    expect(arg.message0).toBe('do thing with %1');
    expect(arg.args0).toEqual([{ type: 'input_value', name: 'VAL' }]);
    expect(arg.colour).toBe(250);
    expect(arg.previousStatement).toBe(true);
    expect(arg.nextStatement).toBe(true);
    expect(arg.tooltip).toBe('Does a thing');
    // message and args should not be in the spread (they become message0/args0)
    expect(arg.message).toBeUndefined();
    expect(arg.args).toBeUndefined();
  });

  it('passes output field through to jsonInit', () => {
    const jsonInitMock = vi.fn();
    const manifest = makeManifest({
      blocks: [
        {
          type: 'output_block',
          message: 'get value',
          args: [],
          output: 'String',
        },
      ],
    });

    registerDeviceBlocks([manifest]);

    const blockThis = { jsonInit: jsonInitMock } as unknown as { jsonInit: (def: Record<string, unknown>) => void };
    mockBlocks['output_block'].init.call(blockThis);

    const arg = jsonInitMock.mock.calls[0][0];
    expect(arg.output).toBe('String');
  });
});
