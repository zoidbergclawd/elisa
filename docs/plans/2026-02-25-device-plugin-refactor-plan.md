# Device Plugin Architecture Refactor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor Elisa's hard-coded IoT/hardware integration into a first-class device plugin system, where each device is a self-contained directory with a JSON manifest. Portals become MCP + CLI only.

**Architecture:** Backend DeviceRegistry scans `devices/*/device.json` at startup, validates with Zod, and serves manifests to the frontend via REST. Frontend dynamically registers Blockly blocks from manifests. Deploy phase uses a provides/requires DAG to order device deployments. Existing IoT code is migrated into four device plugins.

**Tech Stack:** TypeScript, Zod 4 (manifest validation), Blockly 12 (`jsonInit` for declarative blocks), Vitest (tests), Express 5 (REST endpoint)

**Design doc:** `docs/plans/2026-02-25-device-plugin-architecture-design.md`

---

## Pre-flight

### Task 0: Create refactor branch marker

**Files:** None

**Step 1: Tag the pre-refactor state**

```bash
git tag pre-device-refactor
```

This tag marks the rollback point. The remote already has `eb6e27e` as the safe snapshot.

**Step 2: Verify clean state**

```bash
git status
```

Expected: clean working tree on `feature/iot-sensor-network`.

---

## Phase 1: Manifest Schema & DeviceRegistry (Backend Foundation)

### Task 1: DeviceManifest Zod Schema

**Files:**
- Create: `backend/src/utils/deviceManifestSchema.ts`
- Test: `backend/src/tests/behavioral/deviceManifest.test.ts`

**Step 1: Write the failing test**

Create `backend/src/tests/behavioral/deviceManifest.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/tests/behavioral/deviceManifest.test.ts`
Expected: FAIL — cannot resolve `deviceManifestSchema.js`

**Step 3: Write the schema implementation**

Create `backend/src/utils/deviceManifestSchema.ts` with the full Zod schema from the design doc (Section 5). Export `DeviceManifestSchema` and the inferred type `DeviceManifest`.

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/tests/behavioral/deviceManifest.test.ts`
Expected: ALL PASS (11 tests)

**Step 5: Commit**

```bash
git add backend/src/utils/deviceManifestSchema.ts backend/src/tests/behavioral/deviceManifest.test.ts
git commit -m "feat(schema): add DeviceManifest Zod schema for device plugin validation"
```

---

### Task 2: DeviceRegistry Service

**Files:**
- Create: `backend/src/services/deviceRegistry.ts`
- Test: `backend/src/tests/behavioral/deviceRegistry.test.ts`

**Step 1: Write the failing test**

Create `backend/src/tests/behavioral/deviceRegistry.test.ts`:

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/tests/behavioral/deviceRegistry.test.ts`
Expected: FAIL — cannot resolve `deviceRegistry.js`

**Step 3: Write the DeviceRegistry implementation**

Create `backend/src/services/deviceRegistry.ts`:

```typescript
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
      } catch (err: any) {
        console.warn(`[DeviceRegistry] Skipping ${entry.name}/ — ${err.message}`);
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
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/tests/behavioral/deviceRegistry.test.ts`
Expected: ALL PASS (11 tests)

**Step 5: Commit**

```bash
git add backend/src/services/deviceRegistry.ts backend/src/tests/behavioral/deviceRegistry.test.ts
git commit -m "feat(backend): add DeviceRegistry for plugin discovery and loading"
```

---

### Task 3: REST Endpoint `GET /api/devices`

**Files:**
- Create: `backend/src/routes/devices.ts`
- Modify: `backend/src/server.ts:17-21` (add import + route mount + DeviceRegistry creation)

**Step 1: Write the route**

Create `backend/src/routes/devices.ts`:

```typescript
import { Router } from 'express';
import type { DeviceRegistry } from '../services/deviceRegistry.js';

export function createDeviceRouter({ registry }: { registry: DeviceRegistry }): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(registry.getAllDevices());
  });

  return router;
}
```

**Step 2: Wire into server.ts**

Add to `backend/src/server.ts`:
- Import `DeviceRegistry` and `createDeviceRouter`
- After line 21 (`const hardwareService = ...`), add: `const deviceRegistry = new DeviceRegistry(path.resolve(import.meta.dirname, '../../devices'));`
- After the route mounts (line ~156), add: `app.use('/api/devices', createDeviceRouter({ registry: deviceRegistry }));`

**Step 3: Verify manually**

Run: `cd backend && npx tsx src/server.ts &` then `curl http://localhost:8000/api/devices`
Expected: `[]` (no plugins yet)

**Step 4: Commit**

```bash
git add backend/src/routes/devices.ts backend/src/server.ts
git commit -m "feat(api): add GET /api/devices endpoint for device plugin manifests"
```

---

### Task 4: DeviceInstanceSchema in Spec Validator

**Files:**
- Modify: `backend/src/utils/specValidator.ts:82-145` (add DeviceInstanceSchema, keep old schemas temporarily)
- Modify: `backend/src/tests/behavioral/specValidator.iot.test.ts` (add device instance tests)

**Step 1: Add DeviceInstanceSchema**

Add to `backend/src/utils/specValidator.ts` (after existing hardware schemas, before NuggetSpecSchema):

```typescript
export const DeviceInstanceSchema = z.object({
  pluginId: z.string().max(60),
  instanceId: z.string().max(100),
  fields: z.record(z.unknown()),
});
```

**Step 2: Add `devices` field to NuggetSpecSchema**

In the NuggetSpecSchema definition (around line 113-151), add alongside `hardware`:

```typescript
devices: z.array(DeviceInstanceSchema).max(20).optional(),
```

**Step 3: Write test**

Add to `specValidator.iot.test.ts` (or create new file `specValidator.device.test.ts`):

```typescript
it('accepts spec with devices array', () => {
  const spec = {
    nugget: { goal: 'test', description: 'test' },
    devices: [
      { pluginId: 'heltec-sensor-node', instanceId: 'block_1', fields: { SENSOR_DHT22: true } },
    ],
  };
  expect(NuggetSpecSchema.safeParse(spec).success).toBe(true);
});

it('accepts spec with both devices and portals', () => {
  const spec = {
    nugget: { goal: 'test', description: 'test' },
    devices: [{ pluginId: 'x', instanceId: 'b1', fields: {} }],
    portals: [],
  };
  expect(NuggetSpecSchema.safeParse(spec).success).toBe(true);
});
```

**Step 4: Run tests**

Run: `cd backend && npx vitest run src/utils/specValidator.test.ts src/tests/behavioral/specValidator.iot.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/src/utils/specValidator.ts backend/src/tests/behavioral/specValidator.iot.test.ts
git commit -m "feat(schema): add DeviceInstanceSchema to NuggetSpec validation"
```

---

## Phase 2: Create Device Plugins

### Task 5: Create `devices/_shared/` with ElisaBoard

**Files:**
- Create: `devices/_shared/elisa_hardware.py` (copy from `hardware/lib/elisa_hardware.py`)

**Step 1: Create directory and copy**

```bash
mkdir -p devices/_shared
cp hardware/lib/elisa_hardware.py devices/_shared/elisa_hardware.py
```

**Step 2: Commit**

```bash
git add devices/_shared/elisa_hardware.py
git commit -m "feat(devices): create _shared directory with ElisaBoard base class"
```

---

### Task 6: Create `devices/heltec-sensor-node/` plugin

**Files:**
- Create: `devices/heltec-sensor-node/device.json`
- Create: `devices/heltec-sensor-node/lib/sensors.py` (copy from `hardware/lib/sensors.py`)
- Create: `devices/heltec-sensor-node/lib/oled.py` (copy from `hardware/lib/oled.py`)
- Create: `devices/heltec-sensor-node/lib/nodes.py` (copy from `hardware/lib/nodes.py`)
- Create: `devices/heltec-sensor-node/lib/ssd1306.py` (copy from `hardware/lib/ssd1306.py`)
- Create: `devices/heltec-sensor-node/prompts/agent-context.md` (extract from `backend/src/prompts/builderAgent.ts:76-122`)
- Create: `devices/heltec-sensor-node/templates/sensor_main.py` (copy from `hardware/templates/sensor_node.py`)

**Step 1: Create plugin directory structure**

```bash
mkdir -p devices/heltec-sensor-node/{lib,prompts,templates}
```

**Step 2: Copy MicroPython library files**

```bash
cp hardware/lib/sensors.py devices/heltec-sensor-node/lib/
cp hardware/lib/oled.py devices/heltec-sensor-node/lib/
cp hardware/lib/nodes.py devices/heltec-sensor-node/lib/
cp hardware/lib/ssd1306.py devices/heltec-sensor-node/lib/
cp hardware/templates/sensor_node.py devices/heltec-sensor-node/templates/sensor_main.py
```

**Step 3: Write device.json**

Create `devices/heltec-sensor-node/device.json` with the full manifest from the design doc (Section 2, flash device example). Use the exact JSON from the design doc's "Heltec Sensor Node" manifest.

**Step 4: Write agent-context.md**

Create `devices/heltec-sensor-node/prompts/agent-context.md`. Extract the content from `backend/src/prompts/builderAgent.ts` lines 76-122 (the `buildIotContext()` sensor classes, pin mapping, and MicroPython pitfalls). Format as Markdown with the sensor node-specific sections only.

**Step 5: Verify manifest loads**

Run a quick script or add a test:

```bash
cd backend && node -e "
  import('./src/services/deviceRegistry.js').then(m => {
    const r = new m.DeviceRegistry('../devices');
    console.log(r.getAllDevices().map(d => d.id));
  });
"
```

Expected: `['heltec-sensor-node']`

**Step 6: Commit**

```bash
git add devices/heltec-sensor-node/
git commit -m "feat(devices): create heltec-sensor-node plugin with manifest and libraries"
```

---

### Task 7: Create `devices/heltec-gateway/` plugin

**Files:**
- Create: `devices/heltec-gateway/device.json`
- Create: `devices/heltec-gateway/lib/nodes.py` (copy from `hardware/lib/nodes.py`)
- Create: `devices/heltec-gateway/prompts/agent-context.md`
- Create: `devices/heltec-gateway/templates/gateway_main.py` (copy from `hardware/templates/gateway_node.py`)

**Step 1: Create structure and copy files**

```bash
mkdir -p devices/heltec-gateway/{lib,prompts,templates}
cp hardware/lib/nodes.py devices/heltec-gateway/lib/
cp hardware/templates/gateway_node.py devices/heltec-gateway/templates/gateway_main.py
```

**Step 2: Write device.json**

Use the gateway manifest from the design doc (Section 2). Key: `deploy.requires: ["cloud_url", "api_key"]`.

**Step 3: Write agent-context.md**

Extract gateway-specific context from `builderAgent.ts` — GatewayNode class reference, WiFi/HTTP pitfalls, code gen rules for `gateway_main.py`.

**Step 4: Commit**

```bash
git add devices/heltec-gateway/
git commit -m "feat(devices): create heltec-gateway plugin with cloud dependency"
```

---

### Task 8: Create `devices/cloud-dashboard/` plugin

**Files:**
- Create: `devices/cloud-dashboard/device.json`
- Create: `devices/cloud-dashboard/scaffold/` (copy from `hardware/templates/cloud_dashboard/`)
- Create: `devices/cloud-dashboard/prompts/agent-context.md`

**Step 1: Create structure and copy scaffold**

```bash
mkdir -p devices/cloud-dashboard/{scaffold,prompts}
cp -r hardware/templates/cloud_dashboard/* devices/cloud-dashboard/scaffold/
```

**Step 2: Write device.json**

Use the cloud manifest from the design doc (Section 2). Key: `deploy.provides: ["cloud_url", "api_key"]`, `board: null`.

**Step 3: Write agent-context.md**

Brief context about the Cloud Run dashboard: SSE endpoint, ingest API, API key auth.

**Step 4: Commit**

```bash
git add devices/cloud-dashboard/
git commit -m "feat(devices): create cloud-dashboard plugin with scaffold and manifest"
```

---

### Task 9: Create `devices/heltec-blink/` plugin

**Files:**
- Create: `devices/heltec-blink/device.json`
- Create: `devices/heltec-blink/prompts/agent-context.md`
- Create: `devices/heltec-blink/templates/blink.py` (copy from `hardware/templates/blink.py`)

**Step 1: Create structure**

```bash
mkdir -p devices/heltec-blink/{prompts,templates}
cp hardware/templates/blink.py devices/heltec-blink/templates/
```

**Step 2: Write device.json**

Simple flash device: one block (`heltec_blink`), one capability (`led`), flash config with `files: ["main.py"]`, `shared_lib: ["elisa_hardware.py"]`.

**Step 3: Write agent-context.md**

Extract from existing ESP32 Board portal template: ElisaBoard class API, LED control, button reading.

**Step 4: Commit**

```bash
git add devices/heltec-blink/
git commit -m "feat(devices): create heltec-blink plugin (replaces ESP32 serial portal)"
```

---

### Task 10: Plugin Validation Test

**Files:**
- Create: `backend/src/tests/behavioral/devicePlugins.test.ts`

**Step 1: Write test that validates all four plugins**

```typescript
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
```

**Step 2: Run tests**

Run: `cd backend && npx vitest run src/tests/behavioral/devicePlugins.test.ts`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add backend/src/tests/behavioral/devicePlugins.test.ts
git commit -m "test: add device plugin manifest and file validation tests"
```

---

## Phase 3: Switch Integration Points

### Task 11: Deploy DAG Resolver

**Files:**
- Create: `backend/src/services/phases/deployOrder.ts`
- Test: `backend/src/tests/behavioral/deployOrder.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { resolveDeployOrder } from '../../services/phases/deployOrder.js';

describe('resolveDeployOrder', () => {
  it('sorts cloud before flash device that requires cloud_url', () => {
    const devices = [
      { pluginId: 'gateway', instanceId: 'g1', fields: {} },
      { pluginId: 'cloud', instanceId: 'c1', fields: {} },
    ];
    const manifests = new Map([
      ['cloud', { deploy: { method: 'cloud', provides: ['cloud_url'], requires: [] } }],
      ['gateway', { deploy: { method: 'flash', provides: [], requires: ['cloud_url'], flash: {} } }],
    ]);
    const order = resolveDeployOrder(devices, manifests as any);
    const ids = order.map(d => d.pluginId);
    expect(ids.indexOf('cloud')).toBeLessThan(ids.indexOf('gateway'));
  });

  it('keeps independent devices in input order', () => {
    const devices = [
      { pluginId: 'sensor', instanceId: 's1', fields: {} },
      { pluginId: 'blink', instanceId: 'b1', fields: {} },
    ];
    const manifests = new Map([
      ['sensor', { deploy: { method: 'flash', provides: [], requires: [], flash: {} } }],
      ['blink', { deploy: { method: 'flash', provides: [], requires: [], flash: {} } }],
    ]);
    const order = resolveDeployOrder(devices, manifests as any);
    expect(order.map(d => d.pluginId)).toEqual(['sensor', 'blink']);
  });

  it('throws on circular dependency', () => {
    const devices = [
      { pluginId: 'a', instanceId: 'a1', fields: {} },
      { pluginId: 'b', instanceId: 'b1', fields: {} },
    ];
    const manifests = new Map([
      ['a', { deploy: { method: 'flash', provides: ['x'], requires: ['y'], flash: {} } }],
      ['b', { deploy: { method: 'flash', provides: ['y'], requires: ['x'], flash: {} } }],
    ]);
    expect(() => resolveDeployOrder(devices, manifests as any)).toThrow(/cycle/i);
  });

  it('returns empty array for empty input', () => {
    expect(resolveDeployOrder([], new Map() as any)).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/tests/behavioral/deployOrder.test.ts`
Expected: FAIL

**Step 3: Implement resolveDeployOrder**

Create `backend/src/services/phases/deployOrder.ts`. Build a DAG where devices that `provides` a key are predecessors of devices that `requires` that key. Run Kahn's topological sort (or reuse `dag.ts` if its API fits). Throw on cycle.

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/tests/behavioral/deployOrder.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add backend/src/services/phases/deployOrder.ts backend/src/tests/behavioral/deployOrder.test.ts
git commit -m "feat(deploy): add resolveDeployOrder with provides/requires DAG"
```

---

### Task 12: Generic `deployDevices()` in DeployPhase

**Files:**
- Modify: `backend/src/services/phases/deployPhase.ts` (add `deployDevices()`, keep old methods temporarily)
- Modify: `backend/src/services/orchestrator.ts:66-81` (inject DeviceRegistry)
- Test: `backend/src/tests/behavioral/deviceDeploy.test.ts`

**Step 1: Write the failing test**

Create `backend/src/tests/behavioral/deviceDeploy.test.ts` with tests from the design doc Section 6, Layer 3. Test `deployDevices()` with mock DeviceRegistry and mock HardwareService. Verify:
- Cloud deploys before flash devices with requires
- `flash_prompt` emitted for each flash device
- `flash_complete` emitted with success/failure
- Cloud failure allows flash to continue
- Empty devices array returns immediately

**Step 2: Add DeviceRegistry to DeployPhase constructor**

Modify `backend/src/services/phases/deployPhase.ts` constructor to accept an optional `DeviceRegistry`. Add `deployDevices(ctx, gateResolver)` method that:
1. Calls `resolveDeployOrder()`
2. Iterates in order, dispatching to `deployCloud()` or `flashDevice()`
3. Collects provides outputs, injects into requires

**Step 3: Wire DeviceRegistry into Orchestrator**

Modify `backend/src/services/orchestrator.ts`:
- Constructor accepts optional `DeviceRegistry` parameter
- Creates DeviceRegistry with `path.resolve(import.meta.dirname, '../../devices')` if not provided
- Passes to DeployPhase constructor

**Step 4: Add `shouldDeployDevices()` and call in orchestrator**

In orchestrator's `run()` method (around line 142-156), add:

```typescript
if (this.deployPhase.shouldDeployDevices(deployCtx)) {
  await this.deployPhase.deployDevices(deployCtx, this.gateResolver);
}
```

Add this BEFORE the existing IoT/portal/hardware checks so the new path takes priority when `spec.devices` is present.

**Step 5: Run tests**

Run: `cd backend && npx vitest run src/tests/behavioral/deviceDeploy.test.ts`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add backend/src/services/phases/deployPhase.ts backend/src/services/orchestrator.ts backend/src/tests/behavioral/deviceDeploy.test.ts
git commit -m "feat(deploy): add generic deployDevices() with DAG-ordered device deployment"
```

---

### Task 13: Plugin-Driven Agent Prompt Context

**Files:**
- Modify: `backend/src/prompts/builderAgent.ts:68-134` (add plugin path, keep old path temporarily)
- Test: `backend/src/tests/behavioral/builderPrompt.device.test.ts`

**Step 1: Write the failing test**

```typescript
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
});
```

**Step 2: Modify formatTaskPrompt**

Add optional `deviceRegistry` parameter. After the existing IoT context injection (which we keep temporarily), add:

```typescript
if (params.deviceRegistry && spec.devices?.length) {
  const seen = new Set<string>();
  for (const device of spec.devices) {
    if (seen.has(device.pluginId)) continue;
    seen.add(device.pluginId);
    const ctx = params.deviceRegistry.getAgentContext(device.pluginId);
    if (ctx) parts.push(`\n## Device: ${device.pluginId}\n${ctx}`);
  }
}
```

**Step 3: Run tests**

Run: `cd backend && npx vitest run src/tests/behavioral/builderPrompt.device.test.ts`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add backend/src/prompts/builderAgent.ts backend/src/tests/behavioral/builderPrompt.device.test.ts
git commit -m "feat(prompts): inject device plugin agent context into builder prompt"
```

---

### Task 14: Frontend — Fetch Device Manifests and Register Blocks

**Files:**
- Create: `frontend/src/lib/deviceBlocks.ts`
- Modify: `frontend/src/components/BlockCanvas/toolbox.ts` (add `buildDeviceCategories()`)
- Modify: `frontend/src/App.tsx` (fetch `/api/devices` on mount, register blocks, pass to toolbox)

**Step 1: Create deviceBlocks.ts**

```typescript
import Blockly from 'blockly';

export interface DeviceManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  colour: number;
  board: { type: string; variant: string; connection: string; detection?: { usb_vid?: string; usb_pid?: string } } | null;
  capabilities: Array<{ id: string; name: string; kind: string }>;
  blocks: Array<{
    type: string;
    message: string;
    args: Array<Record<string, unknown>>;
    previousStatement?: boolean;
    nextStatement?: boolean;
    output?: string;
    tooltip?: string;
  }>;
  deploy: Record<string, unknown>;
}

export function registerDeviceBlocks(manifests: DeviceManifest[]): void {
  for (const manifest of manifests) {
    for (const blockDef of manifest.blocks) {
      if (Blockly.Blocks[blockDef.type]) continue; // don't re-register
      Blockly.Blocks[blockDef.type] = {
        init(this: Blockly.Block) {
          this.jsonInit({ ...blockDef, colour: manifest.colour });
        },
      };
    }
  }
}
```

**Step 2: Add buildDeviceCategories to toolbox.ts**

Add to `frontend/src/components/BlockCanvas/toolbox.ts`:

```typescript
import type { DeviceManifest } from '../../lib/deviceBlocks';

export function buildDeviceCategories(manifests: DeviceManifest[]): any[] {
  if (!manifests.length) return [];
  return [{
    kind: 'category',
    name: 'Devices',
    colour: '45',
    contents: manifests.flatMap(m =>
      m.blocks.map(b => ({ kind: 'block', type: b.type }))
    ),
  }];
}
```

**Step 3: Wire into App.tsx**

In `frontend/src/App.tsx`:
- Add state: `const [deviceManifests, setDeviceManifests] = useState<DeviceManifest[]>([]);`
- Add useEffect to fetch `/api/devices` on mount, call `registerDeviceBlocks(data)` and `setDeviceManifests(data)`
- Pass `deviceManifests` to the toolbox builder so the Devices category appears dynamically

**Step 4: Verify**

Launch the app (`npm run dev:electron`). If device plugins exist in `devices/`, their blocks should appear in a "Devices" toolbox category.

**Step 5: Commit**

```bash
git add frontend/src/lib/deviceBlocks.ts frontend/src/components/BlockCanvas/toolbox.ts frontend/src/App.tsx
git commit -m "feat(frontend): dynamic device block registration from plugin manifests"
```

---

### Task 15: Frontend — Generic Device Block Interpreter

**Files:**
- Modify: `frontend/src/components/BlockCanvas/blockInterpreter.ts:349-434`
- Create: `frontend/src/components/BlockCanvas/blockInterpreter.device.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { interpretWorkspace } from './blockInterpreter';

const mockManifests = [
  {
    id: 'test-sensor',
    blocks: [{ type: 'test_sensor', args: [{ type: 'input_dummy' }, { type: 'field_checkbox', name: 'ENABLED' }] }],
  },
  {
    id: 'test-cloud',
    blocks: [{ type: 'test_cloud', args: [{ type: 'input_dummy' }, { type: 'field_input', name: 'PROJECT' }] }],
  },
];

function makeBlock(type: string, fields: Record<string, unknown> = {}): any {
  return { type, id: `b_${type}_${Math.random().toString(36).slice(2)}`, fields };
}
function makeWorkspace(blocks: any[]): any {
  return { blocks: { blocks } };
}

describe('Device block interpretation', () => {
  it('recognizes block from loaded manifest and adds to spec.devices', () => {
    const block = makeBlock('test_sensor', { ENABLED: true });
    const ws = makeWorkspace([makeBlock('nugget_goal', { GOAL_TEXT: 'test' }, block)]);
    const spec = interpretWorkspace(ws, [], [], [], mockManifests as any);
    expect(spec.devices).toHaveLength(1);
    expect(spec.devices![0].pluginId).toBe('test-sensor');
    expect(spec.devices![0].fields.ENABLED).toBe(true);
  });

  it('handles multiple device blocks from different plugins', () => {
    const b1 = makeBlock('test_sensor', { ENABLED: true });
    const b2 = makeBlock('test_cloud', { PROJECT: 'my-proj' });
    b1.next = { block: b2 };
    const ws = makeWorkspace([makeBlock('nugget_goal', { GOAL_TEXT: 'test' }, b1)]);
    const spec = interpretWorkspace(ws, [], [], [], mockManifests as any);
    expect(spec.devices).toHaveLength(2);
  });

  it('ignores blocks that do not match any manifest', () => {
    const block = makeBlock('unknown_device', { X: 1 });
    const ws = makeWorkspace([makeBlock('nugget_goal', { GOAL_TEXT: 'test' }, block)]);
    const spec = interpretWorkspace(ws, [], [], [], mockManifests as any);
    expect(spec.devices ?? []).toHaveLength(0);
  });
});
```

**Step 2: Modify interpretWorkspace signature**

Add optional `deviceManifests` parameter to `interpretWorkspace()` in `blockInterpreter.ts` (line 127):

```typescript
export function interpretWorkspace(
  json: Record<string, unknown>,
  skills?: Skill[],
  rules?: Rule[],
  portals?: Portal[],
  deviceManifests?: DeviceManifest[],
): NuggetSpec
```

**Step 3: Add generic device block handler**

In the block type switch (before the IoT cases), add:

```typescript
// Check device plugins
if (deviceManifests?.length) {
  const manifest = deviceManifests.find(m => m.blocks.some(b => b.type === block.type));
  if (manifest) {
    if (!spec.devices) spec.devices = [];
    const fields: Record<string, unknown> = {};
    for (const arg of manifest.blocks.find(b => b.type === block.type)!.args) {
      if ('name' in arg && arg.name) {
        fields[arg.name as string] = block.fields?.[arg.name as string];
      }
    }
    spec.devices.push({ pluginId: manifest.id, instanceId: block.id, fields });
    break;
  }
}
```

**Step 4: Run tests**

Run: `cd frontend && npx vitest run src/components/BlockCanvas/blockInterpreter.device.test.ts`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add frontend/src/components/BlockCanvas/blockInterpreter.ts frontend/src/components/BlockCanvas/blockInterpreter.device.test.ts
git commit -m "feat(interpreter): add generic device block handler from plugin manifests"
```

---

### Task 16: Frontend Types — Add DeviceInstance, Keep Old Types

**Files:**
- Modify: `frontend/src/types/index.ts:80-148` (add DeviceInstance interface)

**Step 1: Add DeviceInstance type**

Add after line 108 (after DocumentationConfig):

```typescript
export interface DeviceInstance {
  pluginId: string;
  instanceId: string;
  fields: Record<string, unknown>;
}
```

**Step 2: Add to NuggetSpec type (if it exists as an interface)**

If NuggetSpec is defined in the frontend types, add `devices?: DeviceInstance[]`. If it's only a backend concern (the frontend passes raw JSON), just ensure the DeviceInstance type is exported.

**Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(types): add DeviceInstance interface for plugin-based devices"
```

---

## Phase 4: Remove Serial from Portals

### Task 17: Remove Serial Portal Mechanism

**Files:**
- Modify: `frontend/src/components/Portals/types.ts:1` (remove 'serial' from PortalMechanism)
- Modify: `frontend/src/components/Portals/portalTemplates.ts` (remove ESP32, LoRa, Cloud Run Deploy templates)
- Modify: `frontend/src/components/Portals/PortalsModal.tsx` (remove serial config UI)
- Modify: `frontend/src/components/Portals/PortalsModal.test.tsx` (update tests)
- Modify: `backend/src/services/portalService.ts` (remove SerialPortalAdapter, hasSerialPortals)
- Modify: `backend/src/services/phases/deployPhase.ts` (remove serial deploy path)
- Modify: `backend/src/services/orchestrator.ts:36,148-156,185-188` (remove serialHandle, old IoT/hardware paths)

**Step 1: Frontend — Remove serial from type**

In `frontend/src/components/Portals/types.ts`, change:
```typescript
// Before:
export type PortalMechanism = 'mcp' | 'cli' | 'serial' | 'auto';
// After:
export type PortalMechanism = 'mcp' | 'cli' | 'auto';
```

**Step 2: Frontend — Remove serial portal templates**

In `frontend/src/components/Portals/portalTemplates.ts`, remove the ESP32 Board, LoRa Radio, and Cloud Run Deploy templates. Keep: File System, GitHub, Brave Search.

**Step 3: Frontend — Remove serial config UI from PortalsModal**

In `PortalsModal.tsx`, remove the serial mechanism option from the dropdown and the serial config section (port, baud rate). Remove the `serialConfig` handling.

**Step 4: Backend — Remove SerialPortalAdapter**

In `backend/src/services/portalService.ts`:
- Remove `SerialPortalAdapter` class
- Remove `hasSerialPortals()` method
- Remove serial case from `initializePortals()`

**Step 5: Backend — Clean deploy phase**

In `backend/src/services/phases/deployPhase.ts`:
- Remove `shouldDeployHardware()`, `deployHardware()` (serial portal deploy path)
- Remove serial-related code from `deployPortals()`

**Step 6: Backend — Clean orchestrator**

In `backend/src/services/orchestrator.ts`:
- Remove `serialHandle` field (line 36)
- Remove `shouldDeployIoT` / `deployIoT` call (lines 148-149)
- Remove `shouldDeployHardware` / `deployHardware` call (lines 153-155)
- Remove serial cleanup in `complete()` (lines 185-188)
- The deploy section becomes:

```typescript
// Deploy
const deployCtx = this.makeContext();
if (this.deployPhase.shouldDeployDevices(deployCtx)) {
  await this.deployPhase.deployDevices(deployCtx, this.gateResolver);
}
if (this.deployPhase.shouldDeployWeb(deployCtx)) {
  const { process: webProc } = await this.deployPhase.deployWeb(deployCtx);
  this.webServerProcess = webProc;
} else if (this.deployPhase.shouldDeployPortals(deployCtx)) {
  await this.deployPhase.deployPortals(deployCtx);
}
```

**Step 7: Update PortalService constructor**

`PortalService` no longer needs `HardwareService` injected (it was only for serial). Update constructor.

**Step 8: Run all tests to check for breakage**

Run: `cd backend && npx vitest run` and `cd frontend && npx vitest run`
Fix any compilation or test failures from the removal.

**Step 9: Commit**

```bash
git add -A
git commit -m "refactor: remove serial mechanism from portals, clean deploy paths"
```

---

### Task 18: Update BoardDetectedModal

**Files:**
- Modify: `frontend/src/components/shared/BoardDetectedModal.tsx`
- Modify: `frontend/src/App.tsx` (update handler)

**Step 1: Change BoardDetectedModal**

Instead of offering to create a serial portal, show which device plugins support the detected board. Change the CTA from "Create Portal" to "Drag a device block" or show matching plugin names.

The modal receives `deviceManifests` and filters by `board.detection.usb_vid/usb_pid` matching the detected `boardInfo`.

**Step 2: Update App.tsx handler**

Replace `handleBoardCreatePortal` with `handleBoardDetected` that highlights matching device plugins (or just dismisses with a helpful message).

**Step 3: Commit**

```bash
git add frontend/src/components/shared/BoardDetectedModal.tsx frontend/src/App.tsx
git commit -m "refactor: BoardDetectedModal shows matching device plugins instead of serial portal"
```

---

## Phase 5: Delete Dead Code

### Task 19: Remove Old IoT Block Definitions and Interpreter Cases

**Files:**
- Modify: `frontend/src/components/BlockCanvas/blockDefinitions.ts:460-607` (remove IoT + hardware blocks)
- Modify: `frontend/src/components/BlockCanvas/blockInterpreter.ts:349-434` (remove old IoT case statements)
- Modify: `frontend/src/components/BlockCanvas/toolbox.ts:84-109` (remove static IoT + Hardware categories)
- Delete: `frontend/src/components/BlockCanvas/blockInterpreter.iot.test.ts`
- Delete: `frontend/src/components/BlockCanvas/blockDefinitions.iot.test.ts`

**Step 1: Remove block definitions**

Delete IoT block definitions (lines 460-607) from `blockDefinitions.ts`.

**Step 2: Remove interpreter cases**

Delete IoT case statements (lines 349-434) from `blockInterpreter.ts`. The generic device handler from Task 15 replaces them.

**Step 3: Remove static toolbox categories**

Delete IoT Devices (lines 84-91) and Hardware (lines 93-109) categories from `toolbox.ts`. These are now generated dynamically by `buildDeviceCategories()`.

**Step 4: Delete old IoT tests**

Delete `blockInterpreter.iot.test.ts` and `blockDefinitions.iot.test.ts` (replaced by `blockInterpreter.device.test.ts` from Task 15).

**Step 5: Run frontend tests**

Run: `cd frontend && npx vitest run`
Expected: ALL PASS (fewer test files now, device tests replace IoT tests)

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove hard-coded IoT block definitions and interpreter cases"
```

---

### Task 20: Remove Old Backend IoT Code

**Files:**
- Modify: `backend/src/utils/specValidator.ts:82-111` (remove old hardware/cloud/docs schemas)
- Modify: `backend/src/prompts/builderAgent.ts:68-122` (remove `buildIotContext()`)
- Modify: `backend/src/services/phases/deployPhase.ts` (remove `shouldDeployIoT()`, `deployIoT()`)
- Delete: `backend/src/tests/behavioral/specValidator.iot.test.ts`
- Delete: `backend/src/tests/behavioral/builderPrompt.iot.test.ts`
- Delete: `backend/src/tests/behavioral/deployPhase.iot.test.ts`
- Delete: `backend/src/tests/behavioral/iot-session.behavior.test.ts`
- Delete: `backend/src/tests/behavioral/iot-pipeline-e2e.behavior.test.ts`
- Delete: `backend/src/tests/fixtures/specs/iot-sensor-network.json` (replaced by plugin-driven fixture)

**Step 1: Remove old schemas from specValidator.ts**

Remove `LoRaConfigSchema`, `HardwareDeviceSchema`, `CloudConfigSchema`, `HardwareConfigSchema`, `DocumentationConfigSchema`. Remove `hardware` and `documentation` fields from `NuggetSpecSchema`. Keep `DeviceInstanceSchema` and `devices` field.

**Step 2: Remove buildIotContext from builderAgent.ts**

Delete the `buildIotContext()` function (lines 68-122) and the call site. Plugin-driven context from Task 13 replaces it.

**Step 3: Remove shouldDeployIoT/deployIoT from deployPhase.ts**

Delete these methods. `shouldDeployDevices()` / `deployDevices()` from Task 12 replaces them.

**Step 4: Delete old IoT test files**

Remove the 5 test files listed above.

**Step 5: Run backend tests**

Run: `cd backend && npx vitest run`
Expected: ALL PASS (test count will drop, then be replaced by plugin tests)

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove hard-coded IoT schemas, prompts, deploy methods, and tests"
```

---

### Task 21: Remove Old Frontend IoT Types

**Files:**
- Modify: `frontend/src/types/index.ts:80-108` (remove LoRaConfig, HardwareDevice, CloudConfig, HardwareConfig, DocumentationConfig)

**Step 1: Remove old IoT types**

Delete interfaces: `LoRaConfig`, `HardwareDevice`, `CloudConfig`, `HardwareConfig`, `DocumentationConfig`. Keep `DeviceInstance`.

**Step 2: Run frontend tests**

Run: `cd frontend && npx vitest run`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "refactor: remove old IoT hardware types from frontend"
```

---

### Task 22: Remove `hardware/` Directory

**Files:**
- Delete: `hardware/` (entire directory — moved to `devices/` plugins)

**Step 1: Verify all files are in device plugins**

Check that every file from `hardware/lib/` and `hardware/templates/` exists in the corresponding `devices/` plugin. Use `diff` or manual comparison.

**Step 2: Delete hardware directory**

```bash
rm -rf hardware/
```

**Step 3: Update any remaining references**

Search for `hardware/` path references in the codebase. Update `hardware/README.md` references in docs to point to `devices/` plugin READMEs.

**Step 4: Run all tests**

Run: `cd backend && npx vitest run` and `cd frontend && npx vitest run`
Expected: ALL PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove hardware/ directory (migrated to devices/ plugins)"
```

---

## Phase 6: Update Example Nuggets

### Task 23: Update hardwareBlink Example

**Files:**
- Modify: `frontend/src/lib/examples/hardwareBlink.ts` (use device block instead of serial portal)

**Step 1: Update the example**

Replace the serial portal reference with a `heltec_blink` device block in the workspace JSON. Remove the `portals` array entry for the ESP32 Board. The example should use the new device block from the `heltec-blink` plugin.

**Step 2: Run example tests**

Run: `cd frontend && npx vitest run src/lib/examples/examples.test.ts`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add frontend/src/lib/examples/hardwareBlink.ts
git commit -m "refactor: update hardwareBlink example to use device plugin block"
```

---

## Phase 7: E2E Pipeline Test

### Task 24: Device Pipeline E2E Test

**Files:**
- Create: `backend/src/tests/behavioral/device-pipeline-e2e.behavior.test.ts`

**Step 1: Write the E2E test**

Test the full pipeline with device plugins:
1. Create a spec with `devices: [{ pluginId: 'heltec-sensor-node', ... }]`
2. Validate with `NuggetSpecSchema` — passes
3. Call `formatTaskPrompt()` with `deviceRegistry` — contains sensor API from plugin
4. Call `resolveDeployOrder()` — correct ordering
5. Call `shouldDeployDevices()` — returns true

This mirrors `iot-pipeline-e2e.behavior.test.ts` but exercises the plugin path.

**Step 2: Run test**

Run: `cd backend && npx vitest run src/tests/behavioral/device-pipeline-e2e.behavior.test.ts`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add backend/src/tests/behavioral/device-pipeline-e2e.behavior.test.ts
git commit -m "test: add device plugin pipeline end-to-end validation"
```

---

## Phase 8: Full Test Suite & Documentation

### Task 25: Run Full Test Suite

**Files:** None (verification only)

**Step 1: Run backend tests**

Run: `cd backend && npx vitest run`
Expected: ALL PASS

**Step 2: Run frontend tests**

Run: `cd frontend && npx vitest run`
Expected: ALL PASS

**Step 3: Run CLI tests**

Run: `cd cli && npx vitest run`
Expected: ALL PASS

**Step 4: Fix any failures before proceeding**

---

### Task 26: Update Architecture Documentation

**Files:**
- Modify: `ARCHITECTURE.md`
- Modify: `docs/INDEX.md`
- Modify: `backend/CLAUDE.md`
- Modify: `frontend/CLAUDE.md`
- Modify: `frontend/src/components/CLAUDE.md`
- Modify: `backend/src/services/CLAUDE.md`

**Step 1: Update ARCHITECTURE.md**

Add Device Plugin System section. Remove IoT-specific deploy flow references. Update data flow diagram.

**Step 2: Update docs/INDEX.md**

Add `devices/` to directory map. Remove `hardware/`. Add `backend/src/services/deviceRegistry.ts` and `backend/src/utils/deviceManifestSchema.ts` to key source files.

**Step 3: Update backend/CLAUDE.md**

Add DeviceRegistry to structure. Add `GET /api/devices` to API table. Update deploy flow section. Remove IoT-specific deploy flow.

**Step 4: Update frontend/CLAUDE.md**

Add `deviceBlocks.ts` to structure. Update BlockCanvas subsystem description. Note dynamic block loading.

**Step 5: Update component and services CLAUDE.md files**

Reflect removal of serial portals, addition of device blocks.

**Step 6: Commit**

```bash
git add -A
git commit -m "docs: update architecture docs for device plugin architecture"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 0 | 0 | Tag rollback point |
| 1 | 1-4 | Backend foundation: manifest schema, DeviceRegistry, REST endpoint, spec validator |
| 2 | 5-10 | Create four device plugins + validation tests |
| 3 | 11-16 | Switch integration points: deploy DAG, generic deploy, prompt injection, frontend blocks, interpreter |
| 4 | 17-18 | Remove serial from portals, update BoardDetectedModal |
| 5 | 19-22 | Delete dead code: old blocks, schemas, types, hardware/ directory |
| 6 | 23 | Update example nuggets |
| 7 | 24 | E2E pipeline test |
| 8 | 25-26 | Full test suite + documentation |

**Total: 27 tasks across 9 phases**

Each task is one commit. Each commit leaves the codebase in a working state. Tests first, implementation second, commit after each step.
