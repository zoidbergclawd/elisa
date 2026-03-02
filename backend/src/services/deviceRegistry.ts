import fs from 'node:fs';
import path from 'node:path';
import { DeviceManifestSchema, type DeviceManifest } from '../utils/deviceManifestSchema.js';

export class DeviceRegistry {
  private devices = new Map<string, DeviceManifest>();
  private pluginDirs = new Map<string, string>(); // id -> absolute plugin dir
  private contextCache = new Map<string, string>();
  private devicesRoot: string;

  constructor(devicesDir: string) {
    this.devicesRoot = devicesDir;
    this.loadPlugins();
  }

  private loadPlugins(): void {
    if (!fs.existsSync(this.devicesRoot)) return;

    const entries = fs.readdirSync(this.devicesRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('_')) continue;

      const pluginDir = path.join(this.devicesRoot, entry.name);
      const manifestPath = path.join(pluginDir, 'device.json');

      if (!fs.existsSync(manifestPath)) {
        console.warn(`[DeviceRegistry] Skipping ${entry.name}/ — no device.json`);
        continue;
      }

      try {
        const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        const result = DeviceManifestSchema.safeParse(raw);
        if (!result.success) {
          const firstError = result.error.issues[0];
          console.warn(`[DeviceRegistry] Skipping ${entry.name}/ — ${firstError.path.join('.')}: ${firstError.message}`);
          continue;
        }

        if (this.devices.has(result.data.id)) {
          console.warn(`[DeviceRegistry] Duplicate device id "${result.data.id}", overwriting`);
        }

        this.devices.set(result.data.id, result.data);
        this.pluginDirs.set(result.data.id, pluginDir);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[DeviceRegistry] Skipping ${entry.name}/ — ${message}`);
      }
    }
  }

  getDevice(id: string): DeviceManifest | undefined {
    return this.devices.get(id);
  }

  getAllDevices(): DeviceManifest[] {
    return Array.from(this.devices.values());
  }

  getDevicesByBoard(boardType: string): DeviceManifest[] {
    return this.getAllDevices().filter(d => d.board?.type === boardType);
  }

  getBlockDefinitions(): Array<DeviceManifest['blocks'][number] & { colour: number }> {
    const defs: Array<DeviceManifest['blocks'][number] & { colour: number }> = [];
    for (const device of this.devices.values()) {
      for (const block of device.blocks) {
        defs.push({ ...block, colour: device.colour });
      }
    }
    return defs;
  }

  getAgentContext(deviceId: string): string {
    if (this.contextCache.has(deviceId)) return this.contextCache.get(deviceId)!;

    const pluginDir = this.pluginDirs.get(deviceId);
    if (!pluginDir) return '';

    const promptPath = path.join(pluginDir, 'prompts', 'agent-context.md');
    let content = '';
    try {
      content = fs.readFileSync(promptPath, 'utf-8');
    } catch {
      // No prompt file — not an error
    }
    this.contextCache.set(deviceId, content);
    return content;
  }

  getFlashFiles(deviceId: string): { lib: string[]; shared: string[] } {
    const manifest = this.devices.get(deviceId);
    const pluginDir = this.pluginDirs.get(deviceId);
    if (!manifest || !pluginDir || manifest.deploy.method !== 'flash') {
      return { lib: [], shared: [] };
    }

    const flash = manifest.deploy.flash;
    const lib = flash.lib.map(f => path.join(pluginDir, 'lib', f));
    const shared = flash.shared_lib.map(f => path.join(this.devicesRoot, '_shared', f));
    return { lib, shared };
  }

  getScaffoldDir(deviceId: string): string | null {
    const manifest = this.devices.get(deviceId);
    const pluginDir = this.pluginDirs.get(deviceId);
    if (!manifest || !pluginDir || manifest.deploy.method !== 'cloud') return null;
    return path.join(pluginDir, manifest.deploy.cloud.scaffold_dir);
  }

  getPluginDir(deviceId: string): string | undefined {
    return this.pluginDirs.get(deviceId);
  }
}
