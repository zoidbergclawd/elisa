import { describe, it, expect } from 'vitest';
import { DeviceManifestSchema } from '../../utils/deviceManifestSchema.js';

const validFlashManifest = {
  id: 'test-sensor',
  name: 'Test Sensor',
  version: '1.0.0',
  description: 'A test sensor device',
  colour: 45,
  board: {
    type: 'esp32',
    variant: 'heltec_lora_v3',
    connection: 'serial',
    detection: { usb_vid: '0x303A', usb_pid: '0x1001' },
  },
  capabilities: [
    { id: 'temp', name: 'Temperature', kind: 'sensor', params: [{ name: 'pin', type: 'number', default: 13 }] },
  ],
  blocks: [{
    type: 'test_sensor',
    message: 'Test Sensor %1 Enabled %2',
    args: [
      { type: 'input_dummy' },
      { type: 'field_checkbox', name: 'ENABLED', checked: true },
    ],
    previousStatement: true,
    nextStatement: true,
    tooltip: 'A test sensor block',
  }],
  deploy: {
    method: 'flash',
    provides: [],
    requires: [],
    flash: {
      files: ['main.py'],
      lib: ['sensor.py'],
      shared_lib: ['elisa_hardware.py'],
      prompt_message: 'Plug in your sensor and click Ready',
    },
  },
};

const validCloudManifest = {
  id: 'test-cloud',
  name: 'Test Cloud',
  version: '1.0.0',
  description: 'A test cloud device',
  colour: 210,
  board: null,
  capabilities: [{ id: 'ingest', name: 'Data Ingest', kind: 'network' }],
  blocks: [{
    type: 'test_cloud',
    message: 'Cloud %1 Project %2',
    args: [
      { type: 'input_dummy' },
      { type: 'field_input', name: 'PROJECT', text: '' },
    ],
  }],
  deploy: {
    method: 'cloud',
    provides: ['cloud_url', 'api_key'],
    requires: [],
    cloud: {
      platform: 'cloud_run',
      scaffold_dir: 'scaffold',
      params: [{ name: 'project', field: 'PROJECT' }],
    },
  },
};

describe('DeviceManifestSchema', () => {
  it('accepts valid flash device manifest', () => {
    const result = DeviceManifestSchema.safeParse(validFlashManifest);
    expect(result.success).toBe(true);
  });

  it('accepts valid cloud device manifest (board: null)', () => {
    const result = DeviceManifestSchema.safeParse(validCloudManifest);
    expect(result.success).toBe(true);
  });

  it('rejects manifest missing required id', () => {
    const { id, ...noId } = validFlashManifest;
    expect(DeviceManifestSchema.safeParse(noId).success).toBe(false);
  });

  it('rejects manifest missing blocks', () => {
    const { blocks, ...noBlocks } = validFlashManifest;
    expect(DeviceManifestSchema.safeParse(noBlocks).success).toBe(false);
  });

  it('rejects manifest missing deploy', () => {
    const { deploy, ...noDeploy } = validFlashManifest;
    expect(DeviceManifestSchema.safeParse(noDeploy).success).toBe(false);
  });

  it('rejects invalid block type (uppercase)', () => {
    const bad = { ...validFlashManifest, blocks: [{ ...validFlashManifest.blocks[0], type: 'BadName' }] };
    expect(DeviceManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects flash deploy without files array', () => {
    const bad = {
      ...validFlashManifest,
      deploy: { method: 'flash', provides: [], requires: [], flash: { lib: [], shared_lib: [], prompt_message: 'hi' } },
    };
    expect(DeviceManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects cloud deploy without provides', () => {
    const bad = {
      ...validCloudManifest,
      deploy: { method: 'cloud', provides: [], requires: [], cloud: { platform: 'x', scaffold_dir: 's', params: [] } },
    };
    expect(DeviceManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects unknown block field type', () => {
    const bad = {
      ...validFlashManifest,
      blocks: [{ ...validFlashManifest.blocks[0], args: [{ type: 'field_slider', name: 'X' }] }],
    };
    expect(DeviceManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects invalid version format', () => {
    const bad = { ...validFlashManifest, version: 'v1' };
    expect(DeviceManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts manifest with optional spec_mapping', () => {
    const withMapping = {
      ...validFlashManifest,
      spec_mapping: { role: 'sensor_node', extract_fields: { sensors: { ENABLED: 'temp' } } },
    };
    expect(DeviceManifestSchema.safeParse(withMapping).success).toBe(true);
  });
});
