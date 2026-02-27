# Creating Device Plugins

## Introduction

Device plugins are modular hardware definitions that Elisa loads at startup from the `devices/` directory. Each plugin describes a specific hardware board or cloud service: its capabilities, the Blockly blocks it contributes to the visual toolbox, how its agent prompt context is constructed, and how code is deployed to it.

**When to create a device plugin:**

- You are adding support for a new hardware board (e.g., a different ESP32 variant, an Arduino, a Raspberry Pi Pico).
- You are creating a new sensor/actuator configuration on an existing board (e.g., a weather station variant of the Heltec ESP32).
- You are adding a cloud-deployed component (e.g., a dashboard or API backend on Google Cloud Run).

**What happens when a plugin is loaded:**

1. Its Blockly block definitions are registered in the frontend toolbox, so users can drag-and-drop the device into their designs.
2. Its agent context prompt (if provided) is injected into builder agent prompts, giving the AI detailed knowledge of the hardware.
3. Its deploy configuration is registered, enabling the flash wizard or cloud deploy pipeline for builds that include the device.

Plugins are validated against a Zod schema (`backend/src/utils/deviceManifestSchema.ts`) at load time. Invalid manifests are skipped with a warning; they do not crash the application.

---

## Plugin Directory Structure

Each plugin lives in its own subdirectory under `devices/`. The directory name is conventionally the same as the plugin `id`, but the `id` field in `device.json` is what the system uses internally.

```
devices/
  my-plugin/
    device.json              # Required: plugin manifest (validated by Zod schema)
    prompts/
      agent-context.md       # Optional: injected into builder agent prompts
    templates/
      main.py                # Optional: starter code templates for agent use
    lib/
      my_driver.py           # Optional: MicroPython libraries flashed with user code
  _shared/
    elisa_hardware.py        # Shared base class available to all plugins
```

### File roles

| File | Required | Purpose |
|------|----------|---------|
| `device.json` | Yes | The plugin manifest. Defines the device identity, board, capabilities, Blockly blocks, and deploy configuration. Validated against `DeviceManifestSchema` at startup. |
| `prompts/agent-context.md` | No | Markdown injected into the builder agent's system prompt when this device is part of a build. Use this to describe pin assignments, wiring details, library APIs, and hardware quirks the agent needs to know. |
| `templates/*.py` | No | Starter code files. The deploy pipeline references these via `deploy.flash.files`. They are the entry-point scripts flashed to the device. |
| `lib/*.py` | No | MicroPython library files specific to this plugin. Referenced via `deploy.flash.lib`. Flashed alongside the template files. |
| `_shared/*.py` | N/A | Shared libraries available to all plugins. Referenced via `deploy.flash.shared_lib`. Located in the `devices/_shared/` directory, not inside individual plugins. |

### How the `_shared/` directory works

The `devices/_shared/` directory contains MicroPython libraries that are common across multiple device plugins. For example, `elisa_hardware.py` provides the `ElisaBoard` base class used by all Heltec-based plugins. When a plugin lists a file in `deploy.flash.shared_lib`, the flash pipeline resolves it from `devices/_shared/`.

Directories starting with `_` are skipped during plugin discovery -- they are never treated as plugin directories.

---

## Manifest Reference (`device.json`)

The manifest is a JSON file validated against the `DeviceManifestSchema` Zod schema. Below is a complete reference of every field, organized by section.

### Top-level fields

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | string | Yes | Lowercase alphanumeric + hyphens, starts with letter, max 60 chars. Pattern: `^[a-z][a-z0-9-]*$` | Unique identifier for the plugin. Used as the key in the device registry. |
| `name` | string | Yes | Max 100 chars | Human-readable display name shown in the UI. |
| `version` | string | Yes | Semver format: `^\d+\.\d+\.\d+$` | Plugin version. |
| `description` | string | Yes | Max 500 chars | Short description of what the device/plugin does. |
| `icon` | string | No | Max 50 chars | Icon identifier for UI display (e.g., `"lightbulb"`, `"thermometer"`, `"cloud"`). |
| `colour` | number | Yes | Integer, 0--360 | Hue value for the Blockly block colour. All blocks from this plugin share this colour. |

**Example (from `heltec-blink`):**

```json
{
  "id": "heltec-blink",
  "name": "Heltec Blink",
  "version": "1.0.0",
  "description": "Simple ESP32 LED blink project using the ElisaBoard class",
  "icon": "lightbulb",
  "colour": 45
}
```

### `board` object

Describes the physical board. Set to `null` for cloud-only plugins that have no hardware board.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `board` | object or null | Yes | -- | The board descriptor, or `null` for cloud plugins. |
| `board.type` | string | Yes (if object) | Max 50 chars | Board family (e.g., `"esp32"`, `"rp2040"`). |
| `board.variant` | string | Yes (if object) | Max 50 chars | Specific board model (e.g., `"heltec_lora_v3"`). |
| `board.connection` | enum | Yes (if object) | `"serial"`, `"wifi"`, or `"bluetooth"` | How the host connects to the board for flashing. |
| `board.detection` | object | No | -- | USB detection hints for auto-detecting the board. |
| `board.detection.usb_vid` | string | No | Hex format: `^0x[0-9A-Fa-f]{4}$` | USB Vendor ID. |
| `board.detection.usb_pid` | string | No | Hex format: `^0x[0-9A-Fa-f]{4}$` | USB Product ID. |

**Example (physical board):**

```json
"board": {
  "type": "esp32",
  "variant": "heltec_lora_v3",
  "connection": "serial",
  "detection": {
    "usb_vid": "0x303A",
    "usb_pid": "0x1001"
  }
}
```

**Example (cloud-only, no board):**

```json
"board": null
```

### `capabilities` array

Declares what the device can do. Each capability represents a sensor, actuator, display, radio, network interface, or compute unit. The capabilities array defaults to an empty array if omitted. Maximum 30 capabilities per plugin.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `id` | string | Yes | Max 50 chars | Unique identifier for this capability within the plugin. |
| `name` | string | Yes | Max 100 chars | Human-readable name (e.g., `"DHT22 Temperature/Humidity"`). |
| `kind` | enum | Yes | `"sensor"`, `"actuator"`, `"display"`, `"radio"`, `"network"`, `"compute"` | Category of the capability. |
| `params` | array | No | Max 10 params, defaults to `[]` | Configuration parameters for this capability. |
| `params[].name` | string | Yes | Max 50 chars | Parameter name (e.g., `"pin"`, `"sda"`, `"channel"`). |
| `params[].type` | enum | Yes | `"number"`, `"string"`, `"boolean"` | Parameter data type. |
| `params[].default` | number, string, or boolean | No | -- | Default value if the user does not specify one. |
| `params[].min` | number | No | -- | Minimum allowed value (for numeric params only). |
| `params[].max` | number | No | -- | Maximum allowed value (for numeric params only). |

**Example (simple, from `heltec-blink`):**

```json
"capabilities": [
  {
    "id": "led",
    "name": "Onboard LED",
    "kind": "actuator",
    "params": [{ "name": "pin", "type": "number", "default": 35 }]
  }
]
```

**Example (multiple capabilities, from `heltec-sensor-node`):**

```json
"capabilities": [
  { "id": "dht22", "name": "DHT22 Temperature/Humidity", "kind": "sensor",
    "params": [{ "name": "pin", "type": "number", "default": 13 }] },
  { "id": "oled_ssd1306", "name": "OLED Display", "kind": "display",
    "params": [{ "name": "sda", "type": "number", "default": 17 },
               { "name": "scl", "type": "number", "default": 18 }] },
  { "id": "lora_tx", "name": "LoRa Transmit", "kind": "radio",
    "params": [{ "name": "channel", "type": "number", "default": 1, "min": 0, "max": 255 }] }
]
```

### `blocks` array

Defines the Blockly block definitions contributed by this plugin. At least 1 block is required, with a maximum of 10 per plugin.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `type` | string | Yes | Lowercase alphanumeric + underscores, starts with letter, max 60 chars. Pattern: `^[a-z][a-z0-9_]*$` | Blockly block type identifier. Must be unique across all plugins. |
| `message` | string | Yes | Max 500 chars | Blockly message template. Use `%1`, `%2`, etc. as placeholders for args (in order). |
| `args` | array | Yes | Max 20 args | Block field definitions, matched positionally to `%1`, `%2`, etc. in `message`. |
| `previousStatement` | boolean | No | Defaults to `true` | Whether the block can connect to a block above it. |
| `nextStatement` | boolean | No | Defaults to `true` | Whether the block can connect to a block below it. |
| `output` | string | No | -- | If set, the block is an output block (returns a value of this type) rather than a statement block. |
| `tooltip` | string | No | Max 300 chars | Hover tooltip text shown in the Blockly editor. |

#### Block field types (`args` entries)

The `args` array uses a discriminated union on the `type` field. Each entry must be one of the following:

| `type` value | Fields | Description |
|--------------|--------|-------------|
| `field_checkbox` | `name` (string), `checked` (boolean, default `false`) | A boolean toggle checkbox. |
| `field_number` | `name` (string), `value` (number, default `0`), `min` (number, optional), `max` (number, optional) | A numeric input with optional range constraints. |
| `field_dropdown` | `name` (string), `options` (array of `[label, value]` tuples, min 1) | A dropdown menu. Each option is a `[displayLabel, internalValue]` pair. |
| `field_input` | `name` (string), `text` (string, default `""`) | A free-text input field. |
| `input_dummy` | *(none)* | A visual spacer / line break in the block. Takes no configuration. |

**Example (from `heltec-blink`):**

```json
"blocks": [
  {
    "type": "heltec_blink",
    "message": "Heltec Blink %1 Speed %2",
    "args": [
      { "type": "input_dummy" },
      { "type": "field_dropdown", "name": "SPEED",
        "options": [["Normal", "normal"], ["Fast", "fast"], ["Slow", "slow"]] }
    ],
    "previousStatement": true,
    "nextStatement": true,
    "tooltip": "Blink the onboard LED on a Heltec ESP32 board"
  }
]
```

**Example (from `heltec-sensor-node` -- checkboxes and number fields):**

```json
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
]
```

### `deploy` object

Configures how the device's code is deployed. This is a discriminated union on the `method` field -- either `"flash"` for physical devices or `"cloud"` for cloud-deployed services.

#### Flash deploy (`method: "flash"`)

Used for physical boards that receive code via USB serial (mpremote).

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `method` | `"flash"` | Yes | Literal | Identifies this as a flash deploy. |
| `provides` | string[] | No | Max 10 items, each max 50 chars, defaults to `[]` | Resource identifiers this device provides to other devices (for multi-device deploy ordering). |
| `requires` | string[] | No | Max 10 items, each max 50 chars, defaults to `[]` | Resource identifiers this device requires from other devices (must be deployed after providers). |
| `flash.files` | string[] | Yes | 1--20 items, each max 100 chars | Entry-point files to flash, resolved from `templates/` in the plugin directory. |
| `flash.lib` | string[] | No | Max 20 items, each max 100 chars, defaults to `[]` | Plugin-specific library files to flash, resolved from `lib/` in the plugin directory. |
| `flash.shared_lib` | string[] | No | Max 10 items, each max 100 chars, defaults to `[]` | Shared library files to flash, resolved from `devices/_shared/`. |
| `flash.prompt_message` | string | Yes | Max 200 chars | Message shown to the user in the flash wizard (e.g., "Plug in your board and click Ready"). |

**Example (minimal, from `heltec-blink`):**

```json
"deploy": {
  "method": "flash",
  "provides": [],
  "requires": [],
  "flash": {
    "files": ["main.py"],
    "lib": [],
    "shared_lib": ["elisa_hardware.py"],
    "prompt_message": "Plug in your Heltec board and click Ready"
  }
}
```

**Example (with libraries, from `heltec-sensor-node`):**

```json
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
}
```

#### Cloud deploy (`method: "cloud"`)

Used for services deployed to cloud platforms (e.g., Google Cloud Run).

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `method` | `"cloud"` | Yes | Literal | Identifies this as a cloud deploy. |
| `provides` | string[] | Yes | 1--10 items, each max 50 chars | Resource identifiers this service provides (at least one required for cloud deploys). |
| `requires` | string[] | No | Max 10 items, each max 50 chars, defaults to `[]` | Resource identifiers this service requires from other devices/services. |
| `cloud.platform` | string | Yes | Max 50 chars | Cloud platform identifier (e.g., `"cloud_run"`). |
| `cloud.scaffold_dir` | string | Yes | Max 100 chars | Directory containing scaffold/template files for the cloud service, relative to the plugin directory. |
| `cloud.params` | array | No | Max 10 params, defaults to `[]` | Deploy-time parameters extracted from block fields. |
| `cloud.params[].name` | string | Yes | Max 50 chars | Parameter name used by the deploy pipeline. |
| `cloud.params[].field` | string | Yes | Max 50 chars | Blockly field name to extract the value from. |
| `cloud.params[].default` | string or number | No | -- | Default value if the field is not set. |

**Example (from `cloud-dashboard`):**

```json
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
```

### `spec_mapping` object (optional)

Maps Blockly block field values to NuggetSpec roles and fields. Used for multi-device builds where block configuration needs to be extracted into the build specification.

| Field | Type | Required | Constraints | Description |
|-------|------|----------|-------------|-------------|
| `spec_mapping` | object | No | -- | Omit entirely if not needed. |
| `spec_mapping.role` | string | Yes (if present) | Max 50 chars | The role this device plays in the NuggetSpec (e.g., `"sensor_node"`). |
| `spec_mapping.extract_fields` | object | Yes (if present) | Record of string keys to unknown values | Maps block field names to capability IDs or spec fields. Structure is freeform. |

**Example (from `heltec-sensor-node`):**

```json
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
```

---

## Multi-device deploy ordering

When a build involves multiple devices, the `provides` and `requires` fields create a dependency DAG that determines deploy order. A device that `requires: ["cloud_url"]` will be deployed after the device that `provides: ["cloud_url"]`. This is handled automatically by `deployOrder.ts`.

For single-device plugins, leave `provides` and `requires` as empty arrays.

---

## Complete minimal example

Here is the full `heltec-blink` manifest -- the simplest working plugin:

```json
{
  "id": "heltec-blink",
  "name": "Heltec Blink",
  "version": "1.0.0",
  "description": "Simple ESP32 LED blink project using the ElisaBoard class",
  "icon": "lightbulb",
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
    {
      "id": "led",
      "name": "Onboard LED",
      "kind": "actuator",
      "params": [{ "name": "pin", "type": "number", "default": 35 }]
    }
  ],

  "blocks": [
    {
      "type": "heltec_blink",
      "message": "Heltec Blink %1 Speed %2",
      "args": [
        { "type": "input_dummy" },
        { "type": "field_dropdown", "name": "SPEED",
          "options": [["Normal", "normal"], ["Fast", "fast"], ["Slow", "slow"]] }
      ],
      "previousStatement": true,
      "nextStatement": true,
      "tooltip": "Blink the onboard LED on a Heltec ESP32 board"
    }
  ],

  "deploy": {
    "method": "flash",
    "provides": [],
    "requires": [],
    "flash": {
      "files": ["main.py"],
      "lib": [],
      "shared_lib": ["elisa_hardware.py"],
      "prompt_message": "Plug in your Heltec board and click Ready"
    }
  }
}
```

For a more complex example with multiple capabilities, checkboxes, number fields, library files, and spec mapping, see `devices/heltec-sensor-node/device.json`.

For a cloud deploy example with platform params, see `devices/cloud-dashboard/device.json`.

---

## Agent Context (`prompts/agent-context.md`)

The agent context file is a markdown document that gets injected into the builder agent's system prompt when a build includes a device from your plugin. It gives the AI detailed knowledge of your hardware so it can generate correct MicroPython code.

### How injection works

When the NuggetSpec includes a device with your `pluginId`, the orchestrator calls `deviceRegistry.getAgentContext(pluginId)`. This reads `prompts/agent-context.md` from your plugin directory and appends it to the builder agent's task prompt under a `## Device: <pluginId>` header. The content is cached after the first read. If no `agent-context.md` file exists, the agent receives no device-specific context (this is not an error, but the agent will lack hardware knowledge).

The injection happens in `backend/src/prompts/builderAgent.ts` inside `formatTaskPrompt()`:

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

Each unique `pluginId` in the spec's `devices` array gets its context injected once, even if the same plugin appears multiple times.

### What to include

Your agent context should contain everything the AI needs to write correct code for your hardware:

- **Hardware API reference** -- class names, constructors, methods, return types
- **Pin mappings** -- exact GPIO numbers for your board variant
- **Driver constraints** -- memory limits, timing requirements, protocol quirks
- **Example code snippets** -- minimal working MicroPython examples
- **Import instructions** -- which modules are pre-loaded vs. built-in
- **Pitfalls** -- common MicroPython mistakes to avoid (e.g., `urequests` not `requests`)

### Tips

- Be specific about pin numbers. The agent has no way to look up a datasheet.
- Mention driver limitations (e.g., "memory is limited to ~100KB free heap").
- Include a minimal working MicroPython example so the agent has a concrete starting point.
- List which library files are pre-loaded on the device so the agent knows what to import.
- Add a "Code Generation Rules" section telling the agent what to generate and what NOT to generate (e.g., "DO NOT generate the library files -- only generate main scripts").
- Keep the context focused. The entire file is injected into the prompt, so avoid unnecessary prose.

### Example

Here is the complete agent context from `heltec-blink`, which is a good template for simple plugins:

```markdown
# Heltec Blink -- Agent Context

You are building a simple MicroPython LED blink project for the Heltec WiFi LoRa V3 (ESP32-S3).

## ElisaBoard Class (from elisa_hardware.py)

\```python
from elisa_hardware import ElisaBoard

board = ElisaBoard()

# LED control
board.led_on()
board.led_off()
board.led_blink(times=3, speed="normal")  # speed: "slow", "normal", "fast"

# Button (GPIO 0)
board.on_button_press(lambda: print("pressed!"))
\```

## Key Constraints

- Write MicroPython code (not CPython, not JavaScript)
- The LED is on GPIO 35
- Use `from machine import Pin` for GPIO
- Keep the main loop alive with `while True:` and `time.sleep()`
- DO NOT attempt to deploy or flash -- a separate deploy phase handles that
- NEVER use emoji or unicode characters beyond ASCII
```

For a more complex example with sensor classes, display APIs, and pin mapping tables, see `devices/heltec-sensor-node/prompts/agent-context.md`.

---

## Templates and Libraries

Device plugins can include starter code and MicroPython libraries that are flashed alongside user-generated code.

### `templates/` -- Starter code

The `templates/` directory contains entry-point scripts that the agent can reference or copy when generating code. These are the files listed in `deploy.flash.files` and are the main scripts flashed to the device. For example, `heltec-blink` has `templates/main.py` and `heltec-sensor-node` has `templates/sensor_main.py`.

### `lib/` -- Plugin-specific libraries

The `lib/` directory contains MicroPython modules specific to your plugin. These are flashed to the device alongside the main scripts. They are referenced via `deploy.flash.lib` in your manifest. For example, `heltec-sensor-node` ships with `sensors.py`, `oled.py`, `nodes.py`, and `ssd1306.py` in its `lib/` directory.

The agent context should tell the AI that these libraries are pre-loaded, so the agent imports from them rather than trying to re-implement them.

### `_shared/` -- Shared libraries for all plugins

The `devices/_shared/` directory contains MicroPython libraries available to all plugins. The primary example is `elisa_hardware.py`, which provides the `ElisaBoard` base class with LED control, button handling, LoRa messaging, and sensor reading.

To include a shared library in your plugin's flash payload, add it to `deploy.flash.shared_lib`:

```json
"flash": {
  "files": ["main.py"],
  "lib": [],
  "shared_lib": ["elisa_hardware.py"]
}
```

When the flash pipeline runs, it resolves `shared_lib` entries from `devices/_shared/`. In code, `DeviceRegistry.getFlashFiles()` maps them:

```typescript
const shared = flash.shared_lib.map(f => path.join(this.devicesRoot, '_shared', f));
```

This means `"elisa_hardware.py"` resolves to `devices/_shared/elisa_hardware.py` regardless of which plugin references it.

---

## Deploy Configuration

The `deploy` object in your manifest controls how the device's code is deployed. Beyond the flash/cloud method fields (covered in the Manifest Reference above), the `provides` and `requires` fields create a dependency DAG that determines deploy ordering across multiple devices.

### How the deploy DAG works

When a build involves multiple devices, `resolveDeployOrder()` (in `backend/src/services/phases/deployOrder.ts`) topologically sorts them so that providers deploy before consumers:

1. **`provides`** lists capability keys this plugin offers to other devices (e.g., `["cloud_url", "api_key"]`).
2. **`requires`** lists capability keys this plugin needs from other devices (e.g., `["cloud_url", "api_key"]`).
3. The algorithm builds a map from each provided key to its provider plugin, then constructs a dependency graph where each plugin that `requires` a key depends on the plugin that `provides` it.
4. Kahn's topological sort produces a deploy order where providers come first. If a circular dependency is detected, it throws an error.

### Concrete example from the shipped plugins

The IoT sensor network project uses three plugins with the following deploy dependencies:

| Plugin | `provides` | `requires` | Deploy order |
|--------|-----------|-----------|--------------|
| `cloud-dashboard` | `["cloud_url", "api_key"]` | `[]` | 1st (no dependencies) |
| `heltec-gateway` | `[]` | `["cloud_url", "api_key"]` | 2nd (needs cloud URL and API key) |
| `heltec-sensor-node` | `[]` | `[]` | 3rd (no dependencies, but sorted after others) |

The cloud dashboard deploys first because the gateway requires the `cloud_url` and `api_key` that the dashboard provides. The sensor node has no dependency relationships, so its position is determined by input order after dependency constraints are satisfied.

### Flash method fields

For physical devices (`method: "flash"`):

| Field | Purpose |
|-------|---------|
| `flash.files` | Entry-point scripts to flash, resolved from `templates/` in the plugin directory. At least 1 required. |
| `flash.lib` | Plugin-specific library files to flash, resolved from `lib/` in the plugin directory. |
| `flash.shared_lib` | Shared library files to flash, resolved from `devices/_shared/`. |
| `flash.prompt_message` | Message shown to the user in the flash wizard UI (e.g., "Plug in your Sensor Node and click Ready"). |

### Cloud method fields

For cloud-deployed services (`method: "cloud"`):

| Field | Purpose |
|-------|---------|
| `cloud.platform` | Cloud platform identifier (e.g., `"cloud_run"`). |
| `cloud.scaffold_dir` | Directory containing scaffold files (Dockerfile, app code, etc.) relative to the plugin directory. |
| `cloud.params` | User-configurable parameters extracted from Blockly block fields at deploy time. Each param maps a `name` (used by the deploy pipeline) to a `field` (Blockly field name), with an optional `default`. |

---

## Walkthrough: Creating a Plugin from Scratch

This walkthrough creates a hypothetical "neopixel-strip" plugin for a WS2812 LED strip connected to an ESP32. Follow these steps to understand the end-to-end process.

### Step 1: Create the directory structure

```
devices/
  neopixel-strip/
    device.json
    prompts/
      agent-context.md
    templates/
      main.py
```

### Step 2: Write the manifest (`device.json`)

Create `devices/neopixel-strip/device.json` with a minimal manifest:

```json
{
  "id": "neopixel-strip",
  "name": "NeoPixel LED Strip",
  "version": "1.0.0",
  "description": "WS2812 NeoPixel LED strip controlled by an ESP32",
  "icon": "lightbulb",
  "colour": 290,

  "board": {
    "type": "esp32",
    "variant": "esp32_devkit",
    "connection": "serial"
  },

  "capabilities": [
    {
      "id": "neopixel",
      "name": "WS2812 NeoPixel Strip",
      "kind": "actuator",
      "params": [
        { "name": "pin", "type": "number", "default": 5 },
        { "name": "num_leds", "type": "number", "default": 30, "min": 1, "max": 300 }
      ]
    }
  ],

  "blocks": [
    {
      "type": "neopixel_strip",
      "message": "NeoPixel Strip %1 Data Pin %2 Number of LEDs %3",
      "args": [
        { "type": "input_dummy" },
        { "type": "field_number", "name": "DATA_PIN", "value": 5, "min": 0, "max": 39 },
        { "type": "field_number", "name": "NUM_LEDS", "value": 30, "min": 1, "max": 300 }
      ],
      "previousStatement": true,
      "nextStatement": true,
      "tooltip": "Control a WS2812 NeoPixel LED strip"
    }
  ],

  "deploy": {
    "method": "flash",
    "provides": [],
    "requires": [],
    "flash": {
      "files": ["main.py"],
      "lib": [],
      "shared_lib": ["elisa_hardware.py"],
      "prompt_message": "Plug in your ESP32 with the NeoPixel strip and click Ready"
    }
  }
}
```

Key decisions:
- **One block** (`neopixel_strip`) with two configurable fields: data pin and LED count.
- **One capability** (`neopixel`) of kind `actuator`.
- **Flash deploy** with no `provides` or `requires` (standalone device).
- **`shared_lib`** includes `elisa_hardware.py` for the `ElisaBoard` base class.

### Step 3: Write the agent context (`prompts/agent-context.md`)

Create `devices/neopixel-strip/prompts/agent-context.md`:

```markdown
# NeoPixel Strip -- Agent Context

You are building MicroPython code for a WS2812 NeoPixel LED strip connected to an ESP32.

## NeoPixel API (built-in MicroPython module)

\```python
from machine import Pin
from neopixel import NeoPixel

np = NeoPixel(Pin(5), 30)   # pin, num_leds
np[0] = (255, 0, 0)         # set pixel 0 to red (R, G, B)
np.fill((0, 0, 0))          # turn all pixels off
np.write()                   # push changes to strip
\```

## Pin Mapping

| Function | Pin | Notes |
|----------|-----|-------|
| NeoPixel Data | GPIO 5 | Configurable via block field |
| LED | GPIO 2 | Onboard LED (ESP32 DevKit) |

## Key Constraints

- Use `from neopixel import NeoPixel` -- this is a built-in MicroPython module
- Always call `np.write()` after changing pixel values
- RGB values are 0-255 per channel
- Keep animations in a `while True:` loop with `time.sleep_ms()` delays
- DO NOT attempt to deploy or flash -- a separate deploy phase handles that
- NEVER use emoji or unicode characters beyond ASCII
```

### Step 4: Write the starter template (`templates/main.py`)

Create `devices/neopixel-strip/templates/main.py`:

```python
# NeoPixel Strip - Main Entry Point
from machine import Pin
from neopixel import NeoPixel
import time

DATA_PIN = 5
NUM_LEDS = 30

np = NeoPixel(Pin(DATA_PIN), NUM_LEDS)

def clear():
    np.fill((0, 0, 0))
    np.write()

def rainbow_cycle(wait_ms=20):
    for j in range(256):
        for i in range(NUM_LEDS):
            rc_index = (i * 256 // NUM_LEDS + j) & 255
            np[i] = wheel(rc_index)
        np.write()
        time.sleep_ms(wait_ms)

def wheel(pos):
    if pos < 85:
        return (255 - pos * 3, pos * 3, 0)
    elif pos < 170:
        pos -= 85
        return (0, 255 - pos * 3, pos * 3)
    else:
        pos -= 170
        return (pos * 3, 0, 255 - pos * 3)

clear()
while True:
    rainbow_cycle()
```

### Step 5: Restart and verify

Restart Elisa -- the new "NeoPixel LED Strip" block appears in the Devices category of the Blockly toolbox automatically. No code changes are needed to register the plugin; the `DeviceRegistry` scans the `devices/` directory at startup and picks up any valid `device.json` files.

---

## Validation and Testing

### How manifests are validated

Every `device.json` file is validated against the `DeviceManifestSchema` Zod schema (defined in `backend/src/utils/deviceManifestSchema.ts`) when the `DeviceRegistry` loads plugins at startup. The validation runs via `DeviceManifestSchema.safeParse()`:

```typescript
const result = DeviceManifestSchema.safeParse(raw);
if (!result.success) {
  console.warn(`[DeviceRegistry] Skipping ${entry.name}/ — ${firstError.path.join('.')}: ${firstError.message}`);
  continue;
}
```

Invalid manifests are skipped with a warning in the console. They do not crash the application. This means you can iterate on a manifest and just restart the server to see if it passes validation.

### Running the plugin validation test

The project includes a behavioral test that validates all shipped plugins. To run it:

```bash
cd backend && npx vitest run src/tests/behavioral/devicePlugins.test.ts
```

This test checks every plugin in the `devices/` directory for:
- Valid `device.json` that passes the Zod schema
- Manifest `id` matches the directory name
- All declared `lib` files exist on disk
- All declared `shared_lib` files exist in `devices/_shared/`
- All declared template `files` exist in `templates/`

### Common validation errors

| Error | Cause | Fix |
|-------|-------|-----|
| `id: Invalid` | The `id` field contains uppercase letters, spaces, or starts with a number. | Use lowercase alphanumeric characters and hyphens only. Must start with a letter. Pattern: `^[a-z][a-z0-9-]*$` |
| `blocks: Array must contain at least 1 element(s)` | The `blocks` array is empty. | Every plugin must define at least 1 Blockly block. |
| `blocks.0.type: Invalid` | The block `type` contains uppercase letters, hyphens, or spaces. | Block types use underscores, not hyphens. Pattern: `^[a-z][a-z0-9_]*$` |
| `deploy: Invalid union` | The `deploy` object does not match either the flash or cloud schema. | Ensure `method` is either `"flash"` or `"cloud"`, and include the corresponding `flash` or `cloud` sub-object. |
| `deploy.flash.files: Array must contain at least 1 element(s)` | Flash deploy is missing the `files` array or it is empty. | List at least one entry-point script in `flash.files`. |
| `deploy.flash.prompt_message: Required` | Flash deploy is missing the `prompt_message` field. | Add a `prompt_message` string (shown in the flash wizard UI). |
| `version: Invalid` | The `version` field is not in semver format. | Use `"major.minor.patch"` format, e.g., `"1.0.0"`. |
| `colour: Expected number` | The `colour` field is missing or not a number. | Provide an integer hue value between 0 and 360. |
| `cloud.provides: Array must contain at least 1 element(s)` | Cloud deploy has an empty `provides` array. | Cloud plugins must provide at least one capability key. |
