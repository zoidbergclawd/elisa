// frontend/src/components/BlockCanvas/blockDefinitions.iot.test.ts
import { describe, it, expect } from 'vitest';
import * as Blockly from 'blockly';
import { registerBlocks } from './blockDefinitions';

// Note: registerBlocks() is idempotent (guarded by `registered` flag)

describe('IoT block definitions', () => {
  it('registers iot_sensor_node block', () => {
    registerBlocks();
    expect(Blockly.Blocks['iot_sensor_node']).toBeDefined();
  });

  it('registers iot_gateway_node block', () => {
    registerBlocks();
    expect(Blockly.Blocks['iot_gateway_node']).toBeDefined();
  });

  it('registers iot_cloud_dashboard block', () => {
    registerBlocks();
    expect(Blockly.Blocks['iot_cloud_dashboard']).toBeDefined();
  });

  it('registers hw_read_dht22 block', () => {
    registerBlocks();
    expect(Blockly.Blocks['hw_read_dht22']).toBeDefined();
  });

  it('registers write_guide block', () => {
    registerBlocks();
    expect(Blockly.Blocks['write_guide']).toBeDefined();
  });
});
