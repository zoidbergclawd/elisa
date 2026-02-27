import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DeviceManifestSchema } from '../../utils/deviceManifestSchema.js';

const devicesDir = path.resolve(import.meta.dirname, '../../../../devices');

const plugins = ['heltec-sensor-node', 'heltec-gateway', 'cloud-dashboard', 'heltec-blink'];

describe('Device plugins on disk', () => {
  for (const id of plugins) {
    describe(id, () => {
      const pluginDir = path.join(devicesDir, id);
      const manifestPath = path.join(pluginDir, 'device.json');

      it('has a valid device.json', () => {
        const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const result = DeviceManifestSchema.safeParse(raw);
        if (!result.success) {
          console.error(result.error.issues);
        }
        expect(result.success).toBe(true);
        expect(result.data!.id).toBe(id);
      });

      it('has all declared lib files', () => {
        const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        if (raw.deploy?.method === 'flash' && raw.deploy.flash?.lib) {
          for (const file of raw.deploy.flash.lib) {
            expect(fs.existsSync(path.join(pluginDir, 'lib', file))).toBe(true);
          }
        }
      });

      it('has prompts/agent-context.md', () => {
        expect(fs.existsSync(path.join(pluginDir, 'prompts', 'agent-context.md'))).toBe(true);
      });
    });
  }

  it('_shared/elisa_hardware.py exists', () => {
    expect(fs.existsSync(path.join(devicesDir, '_shared', 'elisa_hardware.py'))).toBe(true);
  });
});
