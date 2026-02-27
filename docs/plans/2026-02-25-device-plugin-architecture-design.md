# Device Plugin Architecture Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan from this design.

**Goal:** Refactor Elisa's hardware/IoT support from hard-coded integration into a first-class device plugin architecture. Devices become standalone plugins discovered from the filesystem. Portals become MCP + CLI only (serial removed).

**Branch:** `feature/iot-sensor-network` (refactor in-place before merging to main)

**Rollback point:** Commit `eb6e27e` on `origin/feature/iot-sensor-network`

---

## Key Decisions

| Decision | Choice |
|----------|--------|
| Plugin distribution | Directory convention (`devices/<id>/device.json`) |
| Topology model | Standalone devices, composed in Blockly |
| Deploy ordering | Dependency graph via provides/requires |
| Refactor scope | Refactor before merging IoT to main |
| Block definitions | Declarative JSON in manifest (Blockly `jsonInit`) |

---

## 1. Plugin Directory Structure

Each device plugin is a self-contained folder in `devices/` at the repo root:

```
devices/
  _shared/
    elisa_hardware.py          # Base ElisaBoard class, shared across plugins

  heltec-sensor-node/
    device.json                # Manifest (the contract)
    lib/
      sensors.py               # DHT22Sensor, ReedSwitch, PIRSensor
      oled.py                  # OLEDDisplay
      nodes.py                 # SensorNode
      ssd1306.py               # SSD1306 driver
    prompts/
      agent-context.md         # Injected into builder agent prompt
    templates/
      sensor_main.py           # Starter template for agent code generation

  heltec-gateway/
    device.json
    lib/
      nodes.py                 # GatewayNode
    prompts/
      agent-context.md
    templates/
      gateway_main.py

  cloud-dashboard/
    device.json
    scaffold/                  # Cloud infrastructure (not MicroPython)
      server.js
      package.json
      Dockerfile
      public/
        index.html
    prompts/
      agent-context.md

  heltec-blink/
    device.json
    lib/                       # (empty, uses _shared/elisa_hardware.py only)
    prompts/
      agent-context.md
    templates/
      blink.py
```

Elisa discovers plugins at startup by scanning `devices/*/device.json`. No npm publishing, no config file — just drop a folder in.

---

## 2. Device Manifest (`device.json`)

### Flash Device Example (Heltec Sensor Node)

```json
{
  "id": "heltec-sensor-node",
  "name": "Heltec Sensor Node",
  "version": "1.0.0",
  "description": "ESP32 sensor node with DHT22, reed switch, PIR, OLED display, and LoRa transmitter",
  "icon": "thermometer",
  "colour": 45,

  "board": {
    "type": "esp32",
    "variant": "heltec_lora_v3",
    "connection": "serial",
    "detection": {
      "usb_vid": "0x303A",
      "usb_pid": "0x1001"
    }
  },

  "capabilities": [
    { "id": "dht22", "name": "DHT22 Temperature/Humidity", "kind": "sensor", "params": [{ "name": "pin", "type": "number", "default": 13 }] },
    { "id": "reed_switch", "name": "Reed Switch (Door)", "kind": "sensor", "params": [{ "name": "pin", "type": "number", "default": 12 }] },
    { "id": "pir", "name": "PIR Motion Sensor", "kind": "sensor", "params": [{ "name": "pin", "type": "number", "default": 14 }] },
    { "id": "oled_ssd1306", "name": "OLED Display", "kind": "display", "params": [{ "name": "sda", "type": "number", "default": 17 }, { "name": "scl", "type": "number", "default": 18 }] },
    { "id": "lora_tx", "name": "LoRa Transmit", "kind": "radio", "params": [{ "name": "channel", "type": "number", "default": 1, "min": 0, "max": 255 }] }
  ],

  "blocks": [
    {
      "type": "heltec_sensor_node",
      "message": "Sensor Node %1 DHT22 %2 Reed Switch %3 PIR %4 OLED %5 LoRa Channel %6 Interval (s) %7",
      "args": [
        { "type": "input_dummy" },
        { "type": "field_checkbox", "name": "SENSOR_DHT22", "checked": true },
        { "type": "field_checkbox", "name": "SENSOR_REED", "checked": true },
        { "type": "field_checkbox", "name": "SENSOR_PIR", "checked": true },
        { "type": "field_checkbox", "name": "HAS_OLED", "checked": true },
        { "type": "field_number", "name": "LORA_CHANNEL", "value": 1, "min": 0, "max": 255 },
        { "type": "field_number", "name": "INTERVAL", "value": 10, "min": 1, "max": 3600 }
      ],
      "previousStatement": true,
      "nextStatement": true,
      "tooltip": "Configure a Heltec sensor node with selected sensors"
    }
  ],

  "deploy": {
    "method": "flash",
    "provides": [],
    "requires": [],
    "flash": {
      "files": ["sensor_main.py"],
      "lib": ["sensors.py", "oled.py", "nodes.py", "ssd1306.py"],
      "shared_lib": ["elisa_hardware.py"],
      "prompt_message": "Plug in your Sensor Node and click Ready"
    }
  },

  "spec_mapping": {
    "role": "sensor_node",
    "extract_fields": {
      "sensors": {
        "SENSOR_DHT22": "dht22",
        "SENSOR_REED": "reed_switch",
        "SENSOR_PIR": "pir"
      },
      "display": { "HAS_OLED": "oled_ssd1306" },
      "lora.channel": "LORA_CHANNEL"
    }
  }
}
```

### Cloud Device Example

```json
{
  "id": "cloud-dashboard",
  "name": "Cloud Dashboard",
  "version": "1.0.0",
  "description": "Real-time IoT dashboard deployed to Google Cloud Run",
  "icon": "cloud",
  "colour": 210,

  "board": null,

  "capabilities": [
    { "id": "ingest", "name": "Data Ingest Endpoint", "kind": "network" },
    { "id": "sse", "name": "Server-Sent Events Stream", "kind": "network" }
  ],

  "blocks": [
    {
      "type": "cloud_dashboard",
      "message": "Cloud Dashboard %1 GCP Project %2",
      "args": [
        { "type": "input_dummy" },
        { "type": "field_input", "name": "GCP_PROJECT", "text": "" }
      ],
      "previousStatement": true,
      "nextStatement": true,
      "tooltip": "Deploy a real-time dashboard to Google Cloud Run"
    }
  ],

  "deploy": {
    "method": "cloud",
    "provides": ["cloud_url", "api_key"],
    "requires": [],
    "cloud": {
      "platform": "cloud_run",
      "scaffold_dir": "scaffold",
      "params": [
        { "name": "project", "field": "GCP_PROJECT" },
        { "name": "region", "field": "GCP_REGION", "default": "us-central1" }
      ]
    }
  }
}
```

### Gateway Example (depends on cloud)

```json
{
  "id": "heltec-gateway",
  "name": "Heltec Gateway",
  "version": "1.0.0",
  "description": "ESP32 gateway that receives LoRa data and relays to cloud via WiFi",
  "icon": "radio",
  "colour": 45,

  "board": {
    "type": "esp32",
    "variant": "heltec_lora_v3",
    "connection": "serial",
    "detection": {
      "usb_vid": "0x303A",
      "usb_pid": "0x1001"
    }
  },

  "capabilities": [
    { "id": "lora_rx", "name": "LoRa Receive", "kind": "radio", "params": [{ "name": "channel", "type": "number", "default": 1, "min": 0, "max": 255 }] },
    { "id": "wifi", "name": "WiFi Connection", "kind": "network" },
    { "id": "http_post", "name": "HTTP POST to Cloud", "kind": "network" }
  ],

  "blocks": [
    {
      "type": "heltec_gateway",
      "message": "Gateway Node %1 LoRa Channel %2 WiFi SSID %3 WiFi Password %4",
      "args": [
        { "type": "input_dummy" },
        { "type": "field_number", "name": "LORA_CHANNEL", "value": 1, "min": 0, "max": 255 },
        { "type": "field_input", "name": "WIFI_SSID", "text": "" },
        { "type": "field_input", "name": "WIFI_PASS", "text": "" }
      ],
      "previousStatement": true,
      "nextStatement": true,
      "tooltip": "Configure a gateway that relays LoRa data to cloud over WiFi"
    }
  ],

  "deploy": {
    "method": "flash",
    "provides": [],
    "requires": ["cloud_url", "api_key"],
    "flash": {
      "files": ["gateway_main.py"],
      "lib": ["nodes.py"],
      "shared_lib": ["elisa_hardware.py"],
      "prompt_message": "Plug in your Gateway Node and click Ready"
    }
  }
}
```

Deploy ordering: cloud-dashboard provides `cloud_url` + `api_key` → gateway requires them → sensor node has no deps. Resolved via topological sort.

---

## 3. Backend Architecture

### New: DeviceRegistry (`backend/src/services/deviceRegistry.ts`)

Responsibilities:
- **Discovery:** Scan `devices/*/device.json` at startup, validate with Zod
- **Lookup:** `getDevice(id)`, `getAllDevices()`, `getDevicesByBoard(boardType)`
- **Prompt loading:** `getAgentContext(deviceId)` reads `prompts/agent-context.md`, cached after first read
- **File resolution:** `getFlashFiles(deviceId, workDir)` resolves lib + shared_lib paths; `getScaffoldDir(deviceId)` returns cloud scaffold path
- **Block definitions:** `getBlockDefinitions()` aggregates blocks from all plugins for the frontend

Created once in `server.ts`, injected into orchestrator, deploy phase, and prompt builder.

### New: REST Endpoint

```
GET /api/devices    # Returns all loaded device plugin manifests
```

Frontend fetches this at startup to register Blockly blocks and build the toolbox.

### Modified: Prompt Builder (`prompts/builderAgent.ts`)

Replace hard-coded `buildIotContext()` with plugin-driven context:

```typescript
// Before:
if (spec.hardware?.devices?.length > 0) {
  parts.push(buildIotContext(spec));
}

// After:
for (const device of spec.devices ?? []) {
  const context = deviceRegistry.getAgentContext(device.pluginId);
  if (context) parts.push(context);
}
```

### Modified: Deploy Phase (`services/phases/deployPhase.ts`)

Replace `shouldDeployIoT()` / `deployIoT()` and serial portal path with unified `deployDevices()`:

```typescript
async deployDevices(ctx: PhaseContext, gateResolver): Promise<void> {
  const devices = ctx.session.spec.devices ?? [];
  if (!devices.length) return;

  // Build deploy DAG from provides/requires
  const order = resolveDeployOrder(devices, deviceRegistry);
  const outputs: Record<string, string> = {};

  for (const device of order) {
    const manifest = deviceRegistry.getDevice(device.pluginId);

    if (manifest.deploy.method === 'cloud') {
      const result = await this.deployCloud(ctx, manifest, device);
      for (const key of manifest.deploy.provides) {
        outputs[key] = result[key];
      }
    } else if (manifest.deploy.method === 'flash') {
      const injections: Record<string, string> = {};
      for (const key of manifest.deploy.requires) {
        injections[key] = outputs[key];
      }
      await this.flashDevice(ctx, manifest, device, injections, gateResolver);
    }
  }
}
```

`resolveDeployOrder()` reuses the existing `dag.ts` topological sort infrastructure.

### Modified: Spec Validator (`utils/specValidator.ts`)

Replace `HardwareDeviceSchema`, `LoRaConfigSchema`, `CloudConfigSchema`, `HardwareConfigSchema`, `DocumentationConfigSchema` with:

```typescript
const DeviceInstanceSchema = z.object({
  pluginId: z.string(),
  instanceId: z.string(),
  fields: z.record(z.unknown()),
});

// In NuggetSpecSchema:
devices: z.array(DeviceInstanceSchema).max(20).optional(),
```

Runtime validation checks `pluginId` against loaded manifests and `fields` against declared block args.

### Removed: Serial from Portals

- Remove `SerialPortalAdapter` from `portalService.ts`
- Remove `hasSerialPortals()` method
- Remove serial deploy path from `deployPhase.ts`
- Remove `serialHandle` from `orchestrator.ts`
- `PortalService` keeps MCP + CLI adapters only

### Unchanged

- `HardwareService` — low-level board detection, compile, flash, serial monitor
- `CloudDeployService` — gcloud scaffold + deploy, called by generic cloud deploy method
- Flash wizard WebSocket events (`flash_prompt`, `flash_progress`, `flash_complete`)
- `dag.ts` — topological sort, reused for deploy ordering

---

## 4. Frontend Architecture

### Dynamic Block Loading

Frontend fetches `GET /api/devices` at startup. Block definitions from manifests are registered with Blockly:

```typescript
// frontend/src/lib/deviceBlocks.ts
export function registerDeviceBlocks(manifests: DeviceManifest[]): void {
  for (const manifest of manifests) {
    for (const blockDef of manifest.blocks) {
      Blockly.Blocks[blockDef.type] = {
        init() {
          this.jsonInit({ ...blockDef, colour: manifest.colour });
        },
      };
    }
  }
}
```

Blockly's `jsonInit()` natively supports the declarative block format.

### Dynamic Toolbox

Replace static IoT categories with generated categories from loaded manifests:

```typescript
// In toolbox.ts
export function buildDeviceCategories(manifests: DeviceManifest[]): ToolboxCategory[] {
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

No plugins loaded → no Devices category in toolbox.

### Generic Block Interpreter

Replace hard-coded IoT case statements with a generic device handler:

```typescript
// In interpretWorkspace()
const deviceManifest = loadedManifests.find(m =>
  m.blocks.some(b => b.type === block.type)
);
if (deviceManifest) {
  if (!spec.devices) spec.devices = [];
  spec.devices.push({
    pluginId: deviceManifest.id,
    instanceId: block.id,
    fields: extractFields(block, deviceManifest),
  });
  continue;
}
```

Interpreter doesn't know what a "sensor node" is — it matches block type to plugin and extracts fields.

### Type Changes

```typescript
// NEW
interface DeviceInstance {
  pluginId: string;
  instanceId: string;
  fields: Record<string, unknown>;
}

// NuggetSpec: replace hardware field with devices
interface NuggetSpec {
  nugget: { goal: string; description?: string };
  requirements?: Requirement[];
  devices?: DeviceInstance[];       // NEW
  portals?: PortalSpec[];           // MCP + CLI only
  deployment?: { target?: string };
  // ...
}
```

### Portal Cleanup

| Remove | Reason |
|--------|--------|
| `serial` from `PortalMechanism` type | Devices handle serial |
| ESP32 Board + LoRa Radio portal templates | Become device plugins |
| Serial config UI in PortalsModal | Portals are MCP + CLI only |
| `serialConfig` field on Portal interface | Gone |
| Cloud Run Deploy portal template | Cloud-dashboard device plugin |
| `SerialPortalAdapter` | Gone |

Remaining portal templates: File System, GitHub, Brave Search.

### BoardDetectedModal

Instead of offering to create a serial portal, highlights which device plugins support the detected board and suggests dragging the relevant block.

---

## 5. Manifest Zod Schema

Full schema for `device.json` validation in `backend/src/utils/deviceManifestSchema.ts`:

```typescript
const BlockFieldSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('field_checkbox'), name: z.string(), checked: z.boolean().default(false) }),
  z.object({ type: z.literal('field_number'), name: z.string(), value: z.number().default(0),
             min: z.number().optional(), max: z.number().optional() }),
  z.object({ type: z.literal('field_dropdown'), name: z.string(),
             options: z.array(z.tuple([z.string(), z.string()])).min(1) }),
  z.object({ type: z.literal('field_input'), name: z.string(), text: z.string().default('') }),
  z.object({ type: z.literal('input_dummy') }),
]);

const BlockDefinitionSchema = z.object({
  type: z.string().regex(/^[a-z][a-z0-9_]*$/).max(60),
  message: z.string().max(500),
  args: z.array(BlockFieldSchema).max(20),
  previousStatement: z.boolean().default(true),
  nextStatement: z.boolean().default(true),
  output: z.string().optional(),
  tooltip: z.string().max(300).optional(),
});

const CapabilitySchema = z.object({
  id: z.string().max(50),
  name: z.string().max(100),
  kind: z.enum(['sensor', 'actuator', 'display', 'radio', 'network', 'compute']),
  params: z.array(z.object({
    name: z.string().max(50),
    type: z.enum(['number', 'string', 'boolean']),
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  })).max(10).default([]),
});

const BoardSchema = z.object({
  type: z.string().max(50),
  variant: z.string().max(50),
  connection: z.enum(['serial', 'wifi', 'bluetooth']),
  detection: z.object({
    usb_vid: z.string().regex(/^0x[0-9A-Fa-f]{4}$/).optional(),
    usb_pid: z.string().regex(/^0x[0-9A-Fa-f]{4}$/).optional(),
  }).optional(),
}).nullable();

const DeployParamSchema = z.object({
  name: z.string().max(50),
  field: z.string().max(50),
  default: z.union([z.string(), z.number()]).optional(),
});

const FlashDeploySchema = z.object({
  method: z.literal('flash'),
  provides: z.array(z.string().max(50)).max(10).default([]),
  requires: z.array(z.string().max(50)).max(10).default([]),
  flash: z.object({
    files: z.array(z.string().max(100)).min(1).max(20),
    lib: z.array(z.string().max(100)).max(20).default([]),
    shared_lib: z.array(z.string().max(100)).max(10).default([]),
    prompt_message: z.string().max(200),
  }),
});

const CloudDeploySchema = z.object({
  method: z.literal('cloud'),
  provides: z.array(z.string().max(50)).min(1).max(10),
  requires: z.array(z.string().max(50)).max(10).default([]),
  cloud: z.object({
    platform: z.string().max(50),
    scaffold_dir: z.string().max(100),
    params: z.array(DeployParamSchema).max(10).default([]),
  }),
});

const DeviceManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/).max(60),
  name: z.string().max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().max(500),
  icon: z.string().max(50).optional(),
  colour: z.number().int().min(0).max(360),

  board: BoardSchema,
  capabilities: z.array(CapabilitySchema).max(30).default([]),
  blocks: z.array(BlockDefinitionSchema).min(1).max(10),
  deploy: z.union([FlashDeploySchema, CloudDeploySchema]),

  spec_mapping: z.object({
    role: z.string().max(50),
    extract_fields: z.record(z.unknown()),
  }).optional(),
});
```

Key design choices:
- Discriminated union on `deploy.method` — `"flash"` vs `"cloud"` have different required fields
- Block field types are a closed set — checkbox, number, dropdown, text, dummy
- Board is nullable — cloud-dashboard has no physical board
- `spec_mapping` is optional — hint for the interpreter, not strictly required

---

## 6. Testing Strategy

### Layer 1: Manifest Validation (`deviceManifest.test.ts`)

```
- Accepts valid heltec-sensor-node manifest
- Accepts valid cloud-dashboard manifest (board: null)
- Rejects manifest with missing required fields (id, blocks, deploy)
- Rejects invalid block type (uppercase, spaces)
- Rejects flash deploy without files array
- Rejects cloud deploy without provides array
- Rejects unknown block field type
- Rejects version format violations
```

### Layer 2: DeviceRegistry (`deviceRegistry.test.ts`)

```
- Loads valid plugins from a temp devices/ directory
- Skips plugin with invalid manifest (logs warning, doesn't crash)
- Skips plugin with missing device.json
- Returns empty array when no devices/ directory exists
- getDevice() returns loaded manifest by id
- getDevice() returns undefined for unknown id
- getBlockDefinitions() aggregates blocks from all plugins
- getAgentContext() reads and caches prompts/agent-context.md
- getAgentContext() returns empty string when no prompt file exists
- getFlashFiles() resolves lib + shared_lib paths correctly
```

### Layer 3: Deploy Integration (`deviceDeploy.test.ts`)

```
- resolveDeployOrder() sorts cloud before flash devices with requires
- resolveDeployOrder() allows parallel deploy of independent devices
- resolveDeployOrder() detects cycles and throws
- deployDevices() deploys cloud first, injects outputs into flash devices
- deployDevices() emits flash_prompt for each flash device
- deployDevices() emits flash_complete with success/failure per device
- deployDevices() skips deploy when spec.devices is empty
- deployDevices() handles cloud deploy failure gracefully
```

### Layer 4: Block Interpreter (`blockInterpreter.device.test.ts`)

```
- Recognizes block type from loaded manifest
- Extracts field values into spec.devices[] entry
- Populates pluginId and instanceId correctly
- Handles multiple device blocks from different plugins
- Ignores blocks that don't match any loaded plugin
- Works alongside non-device blocks (goal, requirements, portals)
```

### Layer 5: Plugin Validation (`devicePlugins.test.ts`)

```
- devices/heltec-sensor-node/device.json passes manifest validation
- devices/heltec-gateway/device.json passes manifest validation
- devices/cloud-dashboard/device.json passes manifest validation
- devices/heltec-blink/device.json passes manifest validation
- All plugin lib/ files exist on disk
- All plugin prompts/ files exist on disk
```

### Migration Regression

Existing IoT tests are rewritten to exercise the plugin path:
- `blockInterpreter.iot.test.ts` → `blockInterpreter.device.test.ts`
- `specValidator.iot.test.ts` → validates `DeviceInstanceSchema`
- `builderPrompt.iot.test.ts` → verifies prompt loaded from plugin
- `deployPhase.iot.test.ts` → `deviceDeploy.test.ts`
- `iot-pipeline-e2e.behavior.test.ts` → `device-pipeline-e2e.behavior.test.ts`

---

## 7. Error Handling & Edge Cases

### Plugin Loading

| Failure | Behavior |
|---------|----------|
| `devices/` doesn't exist | Empty plugin list. No Devices category. No error. |
| Missing `device.json` in a dir | Skip, log warning |
| Invalid `device.json` | Skip, log Zod error path |
| Duplicate plugin `id` | Last loaded wins, log warning |
| Duplicate block type across plugins | Last registered wins, log warning |
| Missing `prompts/agent-context.md` | Empty agent context. Less optimal output, no crash. |
| Missing `lib/` files | Caught at flash time. Per-file error, other files still flash. |
| Missing `_shared/` files | Same — per-file error |

### Deploy DAG

| Case | Behavior |
|------|----------|
| No devices in spec | `deployDevices()` returns immediately |
| Single device, no deps | Deploy immediately |
| All independent | Sequential (flash wizard needs user interaction) |
| Circular dependency | `resolveDeployOrder()` throws. Error event emitted. |
| Unresolved requires | Proceed with undefined. Warning in `flash_complete`. |
| Cloud deploy fails | Flash continues with missing injections. Warning. |

### Frontend Resilience

| Case | Behavior |
|------|----------|
| `GET /api/devices` fails | No device blocks. Retry on reload. |
| Plugin removed while running | Not detected until restart. |
| Block type in workspace but plugin removed | Blockly shows "undefined" badge. Interpreter ignores. |

### Security

| Concern | Mitigation |
|---------|------------|
| Path traversal in plugin files | `path.resolve()` + startsWith check, same as `pathValidator.ts` |
| Prompt injection via agent-context.md | Wrapped in `<user_input>` tags |
| Malicious MicroPython | Runs on user's physical board, not server. No new surface. |

---

## 8. Migration Plan

Executed on `feature/iot-sensor-network` before merging to main. Each step leaves the codebase working with passing tests.

1. **Add new infrastructure** — DeviceRegistry, manifest schema, `GET /api/devices`, generic deploy. All additive.
2. **Create four device plugins** — Move files from `hardware/` into `devices/` structure. Write manifests.
3. **Switch integration points** — Update interpreter, deploy phase, prompt builder to use plugin path. Remove hard-coded IoT path.
4. **Remove serial from portals** — Clean portal types, remove SerialPortalAdapter, update templates.
5. **Delete dead code** — Remove old `hardware/` directory, old block definitions, old schemas.
6. **Update tests** — Rewrite IoT tests to exercise plugin path.
7. **Update docs** — Architecture docs, CLAUDE.md files, INDEX.md.

---

## 9. Data Flow Summary

```
Startup:
  Backend scans devices/**/device.json → DeviceRegistry
  Frontend fetches GET /api/devices → registers Blockly blocks + toolbox

Design time:
  User drags device blocks → Blockly workspace
  User drags portal blocks (MCP/CLI) → Blockly workspace

Build time:
  interpretWorkspace() → spec.devices[] + spec.portals[]
  POST /api/sessions/:id/start → Zod validates spec

  PlanPhase: agents see device context from prompts/agent-context.md
  ExecutePhase: agents generate code using device templates + MCP tools
  DeployPhase:
    1. resolveDeployOrder() → topological sort by provides/requires
    2. For each device in order:
       cloud → deployCloud() → collect outputs
       flash → flashDevice() → inject deps → flash wizard flow
    3. deployPortals() → CLI portals only
```
