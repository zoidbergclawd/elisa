import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DeviceRegistry } from '../../services/deviceRegistry.js';

function makeTempDevicesDir(): string {
  const dir = path.join(os.tmpdir(), `elisa-test-devices-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writePlugin(devicesDir: string, id: string, manifest: Record<string, any>, extras?: Record<string, string>): void {
  const pluginDir = path.join(devicesDir, id);
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(path.join(pluginDir, 'device.json'), JSON.stringify(manifest));
  if (extras) {
    for (const [relPath, content] of Object.entries(extras)) {
      const full = path.join(pluginDir, relPath);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
  }
}

const VALID_MANIFEST = {
  id: 'test-device',
  name: 'Test Device',
  version: '1.0.0',
  description: 'Test',
  colour: 45,
  board: { type: 'esp32', variant: 'test', connection: 'serial' },
  capabilities: [],
  blocks: [{
    type: 'test_device',
    message: 'Test %1',
    args: [{ type: 'input_dummy' }],
  }],
  deploy: {
    method: 'flash',
    provides: [],
    requires: [],
    flash: { files: ['main.py'], lib: [], shared_lib: [], prompt_message: 'Plug in' },
  },
};

describe('DeviceRegistry', () => {
  let devicesDir: string;

  beforeEach(() => { devicesDir = makeTempDevicesDir(); });
  afterEach(() => { fs.rmSync(devicesDir, { recursive: true, force: true }); });

  it('loads valid plugins from devices directory', () => {
    writePlugin(devicesDir, 'test-device', VALID_MANIFEST);
    const registry = new DeviceRegistry(devicesDir);
    expect(registry.getAllDevices()).toHaveLength(1);
    expect(registry.getAllDevices()[0].id).toBe('test-device');
  });

  it('skips plugin with invalid manifest', () => {
    writePlugin(devicesDir, 'bad', { id: 123 }); // invalid: id must be string
    const registry = new DeviceRegistry(devicesDir);
    expect(registry.getAllDevices()).toHaveLength(0);
  });

  it('skips directory with missing device.json', () => {
    fs.mkdirSync(path.join(devicesDir, 'empty-dir'), { recursive: true });
    const registry = new DeviceRegistry(devicesDir);
    expect(registry.getAllDevices()).toHaveLength(0);
  });

  it('returns empty array when devices directory does not exist', () => {
    const registry = new DeviceRegistry('/nonexistent/path');
    expect(registry.getAllDevices()).toHaveLength(0);
  });

  it('getDevice returns manifest by id', () => {
    writePlugin(devicesDir, 'test-device', VALID_MANIFEST);
    const registry = new DeviceRegistry(devicesDir);
    expect(registry.getDevice('test-device')).toBeDefined();
    expect(registry.getDevice('test-device')!.name).toBe('Test Device');
  });

  it('getDevice returns undefined for unknown id', () => {
    const registry = new DeviceRegistry(devicesDir);
    expect(registry.getDevice('nope')).toBeUndefined();
  });

  it('getBlockDefinitions aggregates blocks from all plugins', () => {
    writePlugin(devicesDir, 'a', { ...VALID_MANIFEST, id: 'a', blocks: [{ ...VALID_MANIFEST.blocks[0], type: 'block_a' }] });
    writePlugin(devicesDir, 'b', { ...VALID_MANIFEST, id: 'b', blocks: [{ ...VALID_MANIFEST.blocks[0], type: 'block_b' }] });
    const registry = new DeviceRegistry(devicesDir);
    const defs = registry.getBlockDefinitions();
    expect(defs).toHaveLength(2);
    expect(defs.map(d => d.type)).toEqual(expect.arrayContaining(['block_a', 'block_b']));
  });

  it('getAgentContext reads prompts/agent-context.md', () => {
    writePlugin(devicesDir, 'test-device', VALID_MANIFEST, {
      'prompts/agent-context.md': '# Test Device API\nUse TestSensor(pin) to read data.',
    });
    const registry = new DeviceRegistry(devicesDir);
    const ctx = registry.getAgentContext('test-device');
    expect(ctx).toContain('TestSensor');
  });

  it('getAgentContext returns empty string when no prompt file', () => {
    writePlugin(devicesDir, 'test-device', VALID_MANIFEST);
    const registry = new DeviceRegistry(devicesDir);
    expect(registry.getAgentContext('test-device')).toBe('');
  });

  it('getFlashFiles resolves lib and shared_lib paths', () => {
    const manifest = {
      ...VALID_MANIFEST,
      deploy: {
        ...VALID_MANIFEST.deploy,
        flash: { files: ['main.py'], lib: ['sensor.py'], shared_lib: ['elisa_hardware.py'], prompt_message: 'Go' },
      },
    };
    writePlugin(devicesDir, 'test-device', manifest, { 'lib/sensor.py': '# sensor' });
    // Create _shared dir
    fs.mkdirSync(path.join(devicesDir, '_shared'), { recursive: true });
    fs.writeFileSync(path.join(devicesDir, '_shared', 'elisa_hardware.py'), '# shared');

    const registry = new DeviceRegistry(devicesDir);
    const files = registry.getFlashFiles('test-device');
    expect(files.lib).toHaveLength(1);
    expect(files.lib[0]).toContain('sensor.py');
    expect(files.shared).toHaveLength(1);
    expect(files.shared[0]).toContain('elisa_hardware.py');
  });

  it('skips _shared directory during plugin scan', () => {
    fs.mkdirSync(path.join(devicesDir, '_shared'), { recursive: true });
    fs.writeFileSync(path.join(devicesDir, '_shared', 'elisa_hardware.py'), '# shared');
    writePlugin(devicesDir, 'test-device', VALID_MANIFEST);
    const registry = new DeviceRegistry(devicesDir);
    expect(registry.getAllDevices()).toHaveLength(1); // only the real plugin, not _shared
  });
});
