# Device Plugin Documentation Design

## Approach

Two standalone documents targeting different audiences, plus small updates to existing docs.

## Document 1: `docs/device-plugins.md` — User Guide

**Title:** "Device Plugins — Build with Real Hardware"

**Tone:** Kid-friendly, step-by-step, encouraging — matches existing manual/iot-guide style.

**Sections:**

1. **What are Device Plugins?** — Plugins are like instruction manuals for hardware boards. Each one teaches Elisa how to talk to a specific device. They add blocks to the toolbox automatically.

2. **Shipped Plugins Overview** — Table of the 4 plugins: what they do, hardware needed, difficulty level (Blinky = beginner, Sensor Network = intermediate).

3. **Getting Started: Blinky Board** — Quick walkthrough using `heltec_blink` block. Minimal hardware (just the board). Shows the block, settings, click GO, flash wizard. First hardware win.

4. **Building a Sensor Network** — Main walkthrough (inherits best of iot-guide.md):
   - Bill of materials with quantities
   - Wiring guide with ASCII pin diagrams (preserved from iot-guide.md)
   - Building in Elisa: drag sensor node, gateway, cloud dashboard blocks
   - Flashing: flash wizard walkthrough per device
   - Cloud dashboard setup (Cloud Run instructions)
   - Seeing live data

5. **Troubleshooting** — Hardware-specific troubleshooting table (preserved from iot-guide.md): sensors, LoRa, WiFi, dashboard, board detection.

## Document 2: `docs/creating-device-plugins.md` — Developer Guide

**Title:** "Creating Device Plugins"

**Tone:** Developer-focused, concise, reference-oriented.

**Sections:**

1. **Plugin Directory Structure** — Standard layout diagram (`device.json`, `prompts/agent-context.md`, `templates/`, `lib/`). What each file does.

2. **The Manifest (`device.json`)** — Full schema reference:
   - `id`, `name`, `version`, `description`, `icon`, `colour`
   - `board` object (type, variant, connection, USB detection VID/PID)
   - `capabilities` array (id, name, kind, params with defaults)
   - `blocks` array (Blockly block definitions — type, message, args, tooltip)
   - `deploy` object (method: flash/cloud, provides/requires for DAG ordering, flash files, shared libs)

3. **Agent Context (`prompts/agent-context.md`)** — What it is (injected into builder agent prompts), what to include (hardware API, pin mappings, constraints, examples), tips for writing effective context.

4. **Templates and Libraries** — `templates/` for starter code, `lib/` for MicroPython modules flashed with user code, `_shared/` for cross-plugin libraries (e.g. `elisa_hardware.py`).

5. **Deploy Configuration** — How provides/requires works for multi-device ordering, flash method (files, lib, shared_lib, prompt_message), cloud method.

6. **Walkthrough: Creating a Plugin from Scratch** — Step-by-step example creating a hypothetical NeoPixel LED strip plugin, showing each file.

7. **Validation and Testing** — How manifests are validated (Zod schema), how to run the plugin validation test, what errors look like.

## Updates to Existing Docs

1. **`docs/manual/README.md`** — Update Hardware chapter to reference device plugins and link to `device-plugins.md`.

2. **`docs/block-reference.md`** — Add a "Devices" section noting device blocks are loaded dynamically from plugins, with link to plugin guide.

3. **`docs/INDEX.md`** — Replace `iot-guide.md` entry with `device-plugins.md`, add `creating-device-plugins.md` to documentation map.

4. **Delete `docs/iot-guide.md`** — Replaced by `device-plugins.md`.
