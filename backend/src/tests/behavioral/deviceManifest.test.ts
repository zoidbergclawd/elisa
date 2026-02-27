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

  // ── Esptool deploy schema ──────────────────────────────────────────

  it('accepts valid esptool device manifest', () => {
    const esptoolManifest = {
      ...validFlashManifest,
      id: 'box-3',
      name: 'BOX-3',
      deploy: {
        method: 'esptool',
        provides: [],
        requires: ['agent_id', 'api_key'],
        esptool: {
          firmware_file: 'firmware.bin',
          flash_offset: '0x0',
          baud_rate: 460800,
          chip: 'esp32s3',
          prompt_message: 'Connect your BOX-3 via USB',
        },
      },
    };
    const result = DeviceManifestSchema.safeParse(esptoolManifest);
    expect(result.success).toBe(true);
  });

  it('accepts esptool manifest with defaults', () => {
    const minimal = {
      ...validFlashManifest,
      id: 'box-3-min',
      deploy: {
        method: 'esptool',
        esptool: {
          firmware_file: 'fw.bin',
          prompt_message: 'Plug in',
        },
      },
    };
    const result = DeviceManifestSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      const deploy = result.data.deploy as any;
      expect(deploy.esptool.flash_offset).toBe('0x0');
      expect(deploy.esptool.baud_rate).toBe(460800);
      expect(deploy.esptool.chip).toBe('esp32s3');
      expect(deploy.provides).toEqual([]);
      expect(deploy.requires).toEqual([]);
    }
  });

  it('rejects esptool manifest without firmware_file', () => {
    const bad = {
      ...validFlashManifest,
      deploy: {
        method: 'esptool',
        provides: [],
        requires: [],
        esptool: {
          prompt_message: 'Plug in',
          // missing firmware_file
        },
      },
    };
    expect(DeviceManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects esptool manifest without prompt_message', () => {
    const bad = {
      ...validFlashManifest,
      deploy: {
        method: 'esptool',
        provides: [],
        requires: [],
        esptool: {
          firmware_file: 'fw.bin',
          // missing prompt_message
        },
      },
    };
    expect(DeviceManifestSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects esptool manifest without esptool config object', () => {
    const bad = {
      ...validFlashManifest,
      deploy: {
        method: 'esptool',
        provides: [],
        requires: [],
        // missing esptool object entirely
      },
    };
    expect(DeviceManifestSchema.safeParse(bad).success).toBe(false);
  });

  // ── runtime_provision on flash deploy ──────────────────────────────

  it('accepts flash manifest with optional runtime_provision', () => {
    const withProvision = {
      ...validFlashManifest,
      deploy: {
        ...validFlashManifest.deploy,
        runtime_provision: {
          required: true,
          config_fields: ['personality', 'backpack'],
        },
      },
    };
    const result = DeviceManifestSchema.safeParse(withProvision);
    expect(result.success).toBe(true);
    if (result.success) {
      const deploy = result.data.deploy as any;
      expect(deploy.runtime_provision.required).toBe(true);
      expect(deploy.runtime_provision.config_fields).toEqual(['personality', 'backpack']);
    }
  });

  it('accepts flash manifest without runtime_provision (backward compat)', () => {
    // The existing validFlashManifest has no runtime_provision
    const result = DeviceManifestSchema.safeParse(validFlashManifest);
    expect(result.success).toBe(true);
  });

  it('accepts esptool manifest with runtime_provision', () => {
    const withProvision = {
      ...validFlashManifest,
      id: 'box-3-prov',
      deploy: {
        method: 'esptool',
        provides: [],
        requires: ['agent_id'],
        esptool: {
          firmware_file: 'fw.bin',
          prompt_message: 'Connect BOX-3',
        },
        runtime_provision: {
          required: true,
          config_fields: ['personality'],
        },
      },
    };
    const result = DeviceManifestSchema.safeParse(withProvision);
    expect(result.success).toBe(true);
  });

  it('runtime_provision defaults config_fields to empty array', () => {
    const withProvision = {
      ...validFlashManifest,
      deploy: {
        ...validFlashManifest.deploy,
        runtime_provision: {
          required: true,
        },
      },
    };
    const result = DeviceManifestSchema.safeParse(withProvision);
    expect(result.success).toBe(true);
    if (result.success) {
      const deploy = result.data.deploy as any;
      expect(deploy.runtime_provision.config_fields).toEqual([]);
    }
  });
});
