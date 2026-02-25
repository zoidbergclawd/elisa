# IoT Sensor Network Design

**Date:** 2026-02-25
**Branch:** `feature/iot-sensor-network` (off `main`)
**Status:** Approved

## Overview

Extend Elisa's ESP32 hardware support from single-device LED blink to a full IoT sensor network: a sensor node collecting data from DHT22 (temperature/humidity), reed switch (door open/close), and PIR (motion), transmitting over LoRa to a gateway node that publishes to a cloud-hosted dashboard on Google Cloud Run.

All of this programmable from Blockly blocks in the Elisa IDE.

## Hardware

- **Board:** Heltec WiFi LoRa V3 (ESP32-S3 + SX1262 LoRa + SSD1306 OLED)
- **Sensors:** DHT22/AM2302, reed switch (magnetic), HC-SR501 PIR motion sensor
- **Communication:** LoRa 915 MHz between devices, WiFi + HTTP POST from gateway to cloud
- **Display:** Onboard 128x64 SSD1306 OLED (I2C)

## Architecture

```
                                    Google Cloud Run
                                    +-----------------+
                                    | SSE Server      |
                                    | + Dashboard     |
                                    | (IAP auth)      |
                                    +--------^--------+
                                             |
                                        HTTP POST
                                        (API key)
                                             |
ESP32 #1 (Sensor Node)          ESP32 #2 (Gateway Node)
+----------------------+        +----------------------+
| DHT22  -> read temp  |  LoRa  | LoRa RX -> parse    |
| Reed   -> door open? |------->| WiFi connect         |
| PIR    -> motion?    |  915MHz| HTTP POST to cloud   |
| OLED   -> display    |        |                      |
+----------------------+        +----------------------+
```

## Design Sections

### 1. MicroPython Library Extensions

Extend `hardware/lib/elisa_hardware.py` with high-level classes. Fat library, thin agent - the agent composes library calls rather than generating driver code.

**New sensor classes:**

| Class | Constructor | Key Methods |
|-------|------------|-------------|
| `DHT22Sensor(pin)` | Pin number (default 13) | `.read()` -> `{temperature, humidity}`. Uses built-in `dht` module. Filters invalid reads. |
| `ReedSwitch(pin)` | Pin number (default 12) | `.is_open()` -> bool. `.on_change(callback)` sets IRQ. `.events_since(last_check)` -> bool (did door open in period). |
| `PIRSensor(pin)` | Pin number (default 14) | `.is_motion()` -> bool. `.on_motion(callback)` with 2s cooldown (matches HC-SR501 retrigger). `.events_since(last_check)` -> bool. |

**Display class:**

| Class | Constructor | Key Methods |
|-------|------------|-------------|
| `OLEDDisplay(sda=17, scl=18, w=128, h=64)` | I2C pins (Heltec defaults) | `.text(str, x, y)`, `.clear()`, `.show()`, `.draw_bar(label, value, max, y)`, `.show_readings(dict)` auto-formats sensor data. |

**Node orchestration classes:**

| Class | Constructor | Key Methods |
|-------|------------|-------------|
| `SensorNode(sensors, lora_channel, display=None)` | Sensor list, LoRa channel, optional display | `.start(interval_sec=5)` runs acquisition loop. Polls sensors, packs data, LoRa TX, optional OLED update. Reed/PIR track events within interval window. |
| `GatewayNode(lora_channel, wifi_ssid, wifi_pass, cloud_url)` | LoRa channel, WiFi creds, cloud URL | `.start()` runs LoRa RX loop, parses data, HTTP POSTs to cloud. |

**Pin mapping constants** for Heltec WiFi LoRa V3:

| Function | Pin | Notes |
|----------|-----|-------|
| OLED SDA | 17 | Heltec onboard I2C |
| OLED SCL | 18 | Heltec onboard I2C |
| OLED RST | 21 | Heltec OLED reset |
| DHT22 | 13 | Configurable |
| Reed switch | 12 | Configurable |
| PIR | 14 | Configurable |
| LED | 35 | Existing |

**Driver dependency:** Bundle `ssd1306.py` (standard MicroPython community driver) alongside generated code. `dht` is built into MicroPython firmware. SX1262 driver already exists.

### 2. Cloud Dashboard Service

New backend service: `backend/src/services/cloudDeployService.ts`

**Generated project structure:**

```
iot-dashboard/
  server.js        # Express: POST /data (from ESP32), GET /events (SSE to browser)
  public/
    index.html     # Self-contained dashboard (inline CSS/JS, no build step)
  Dockerfile
  package.json
```

**Server endpoints:**
- `POST /data` - Gateway ESP32 sends JSON sensor readings. Requires API key header. Stores last N readings in memory.
- `GET /events` - SSE endpoint for browser. Streams live sensor updates.
- `GET /` - Serves HTML dashboard.

**Dashboard features:**
- Cards for each sensor: temperature gauge, humidity gauge, door status, motion indicator
- Auto-reconnect SSE on disconnect
- Connection status + last-update timestamp
- Mobile-friendly responsive layout

**Deployment flow:**
1. Agent generates dashboard project in nugget workspace
2. Deploy phase builds Docker image via `gcloud builds submit` (no local Docker required)
3. Deploys to Cloud Run with `--no-allow-unauthenticated`
4. Returns public URL
5. URL injected into gateway ESP32 code before flashing

**Auth:** Google Identity-Aware Proxy (IAP) at Cloud Run level. No auth code in the generated app. Elisa documents IAP setup steps in deploy output.

**Security:** Per-deployment API key generated and shared between gateway ESP32 and Cloud Run service for data ingestion auth.

**Prerequisites:** `gcloud` CLI installed and authenticated, GCP project with Cloud Run API enabled.

### 3. NuggetSpec Schema Extensions

Extend `backend/src/utils/specValidator.ts`:

```typescript
// New hardware config section
hardware: {
  devices: [
    {
      role: 'sensor_node' | 'gateway_node',
      board: 'heltec_lora_v3',
      sensors?: ('dht22' | 'reed_switch' | 'pir')[],  // sensor node only
      display?: 'oled_ssd1306',
      lora: { channel: number, frequency?: number },
    }
  ],
  cloud?: {
    platform: 'cloud_run',
    project?: string,
    region?: string,  // default: us-central1
  }
}

// New documentation config
documentation?: {
  generate: boolean,
  focus: 'how_it_works' | 'setup' | 'parts' | 'all'
}
```

New `deployment.target` value: `'iot'` (multi-device + cloud dashboard).

### 4. Blockly Blocks

Two new toolbox categories.

**"IoT Devices" category (colour 45, role-based):**

| Block | Message | Fields |
|-------|---------|--------|
| `iot_sensor_node` | "Sensor node that reads..." | Multi-checkbox: DHT22, Reed Switch, PIR. Checkbox: OLED display. Number: LoRa channel. Number: broadcast interval (seconds, default 10). |
| `iot_gateway_node` | "Gateway that publishes to the cloud" | Number: LoRa channel. Text: WiFi SSID. Text: WiFi password. |
| `iot_cloud_dashboard` | "Live dashboard on Google Cloud" | Text: GCP project ID. |

**"Hardware" category (colour 45, component-level):**

| Block | Message | Type |
|-------|---------|------|
| `hw_read_dht22` | "Read temperature and humidity" | Statement |
| `hw_read_reed` | "Check if door/window is open" | Statement |
| `hw_read_pir` | "Check for motion" | Statement |
| `hw_oled_text` | "Show text on display" (text, x, y) | Statement |
| `hw_oled_readings` | "Show sensor readings on display" | Statement |
| `hw_oled_clear` | "Clear the display" | Statement |
| `hw_lora_send` | "Send data over LoRa" (data, channel) | Statement |
| `hw_lora_receive` | "When LoRa data arrives" (channel, body) | Statement + input_statement |
| `hw_wifi_connect` | "Connect to WiFi" (ssid, password) | Statement |
| `hw_http_post` | "Send data to URL" (url, data) | Statement |

**"Goals" category addition:**

| Block | Message | Fields |
|-------|---------|--------|
| `write_guide` | "Write me a guide about..." | Dropdown: "how everything works", "how to set it up", "what each part does", "all of the above" |

**Existing flow blocks used:** `timer_every` provides the acquisition loop pattern.

### 5. Deploy Phase: Multi-Device Flash

New flow for `deployment.target === 'iot'` in `deployPhase.ts`:

1. **Cloud deploy** - Generate + deploy dashboard to Cloud Run. Get public URL.
2. **Inject cloud URL** into gateway code as a constant.
3. **Guided flash sequence:**
   - Emit `flash_prompt` WSEvent: `{device_role: 'sensor_node', message: "Plug in your Sensor Node"}`
   - Frontend shows `FlashWizardModal` - "Plug in your **Sensor Node** and click Ready"
   - User clicks Ready -> gate response via existing `/api/sessions/:id/gate`
   - Backend detects board, compiles, flashes sensor node code
   - Emit `flash_complete` for sensor node
   - Repeat for gateway node
4. **Post-flash verification** - Brief pause for reboot, optional LoRa/WiFi check.

**New WSEvent types:** `flash_prompt`, `flash_progress`, `flash_complete`

**New frontend component:** `FlashWizardModal.tsx` - step-by-step flash guide with device illustrations and progress.

### 6. Agent Prompting & Code Generation

**Updated prompt:** `backend/src/prompts/builderAgent.ts` gets an IoT context section (activated when NuggetSpec has `hardware.devices`):
- Full `elisa_hardware.py` API reference
- Example sensor node and gateway node code
- Pin mapping table
- MicroPython pitfalls list

**New templates:**
- `hardware/templates/sensor_node.py` - Complete working sensor node
- `hardware/templates/gateway_node.py` - Complete working gateway
- `hardware/templates/cloud_dashboard/` - Server + dashboard template

**Code generation strategy:**
- Agent generates `sensor_main.py` and `gateway_main.py` in nugget workspace
- Each imports from `elisa_hardware` + new sensor/display classes
- Deploy phase maps files to device roles

**Context chain between agent tasks:**
1. Task 1: Generate sensor node code
2. Task 2: Generate gateway node code (receives sensor node code as context - LoRa protocol must match)
3. Task 3: Generate cloud dashboard (receives gateway HTTP format as context - API must match)
4. Task 4 (optional, if `write_guide` block): Generate kid-friendly documentation

### 7. Kid-Friendly Documentation

When the `write_guide` block is present:
- Post-build agent task generates a Markdown file in the nugget workspace
- Content scaled for ages 8-14: analogies ("LoRa is like walkie-talkies!"), simple diagrams, "try this next" ideas
- Focus area controlled by block dropdown (how it works / setup / parts / all)
- New `documentation_ready` WSEvent with file path
- "Read about your project" button on completion screen
- Opens in rendered Markdown viewer or via Electron `shell.openPath`

### 8. Testing Strategy

**Unit tests:**
- MicroPython library: Sensor classes with mock hardware (existing fallback/stub mode)
- Cloud deploy service: Mock `gcloud` CLI, verify Docker generation
- NuggetSpec schema: Validate IoT hardware configs
- Block interpreter: IoT blocks produce correct NuggetSpec fields
- `write_guide` block interpreter produces correct documentation config

**Integration tests:**
- Deploy phase IoT flow: Mock hardware + cloud services, verify flash sequence + gate prompts
- Agent prompting: Verify IoT context injection into builder prompts
- Multi-device flash sequence: Verify correct events emitted in order

**Manual test procedure (documented, not automated):**
- End-to-end with real Heltec boards + sensors
- Verify LoRa communication between devices
- Verify Cloud Run dashboard receives data
- Verify OLED displays sensor readings

## Files Changed/Created

### New files
| File | Purpose |
|------|---------|
| `hardware/lib/sensors.py` | DHT22Sensor, ReedSwitch, PIRSensor classes |
| `hardware/lib/oled.py` | OLEDDisplay class |
| `hardware/lib/nodes.py` | SensorNode, GatewayNode orchestration classes |
| `hardware/lib/ssd1306.py` | SSD1306 OLED I2C driver (community) |
| `hardware/templates/sensor_node.py` | Sensor node template |
| `hardware/templates/gateway_node.py` | Gateway node template |
| `hardware/templates/cloud_dashboard/server.js` | Cloud dashboard server template |
| `hardware/templates/cloud_dashboard/public/index.html` | Dashboard HTML template |
| `hardware/templates/cloud_dashboard/Dockerfile` | Cloud Run Dockerfile |
| `hardware/templates/cloud_dashboard/package.json` | Dashboard dependencies |
| `backend/src/services/cloudDeployService.ts` | Cloud Run deployment service |
| `frontend/src/components/shared/FlashWizardModal.tsx` | Multi-device flash wizard UI |

### Modified files
| File | Changes |
|------|---------|
| `hardware/lib/elisa_hardware.py` | Import + re-export new sensor/display/node classes |
| `backend/src/utils/specValidator.ts` | Add hardware devices, cloud, documentation Zod schemas |
| `backend/src/services/phases/deployPhase.ts` | Add `deployIoT()` multi-device flow |
| `backend/src/services/hardwareService.ts` | Add per-file flash targeting (sensor vs gateway code) |
| `backend/src/prompts/builderAgent.ts` | Add IoT context section |
| `frontend/src/components/BlockCanvas/blockDefinitions.ts` | Add IoT, Hardware, and write_guide blocks |
| `frontend/src/components/BlockCanvas/toolbox.ts` | Add IoT Devices and Hardware categories |
| `frontend/src/components/BlockCanvas/blockInterpreter.ts` | Handle new block types -> NuggetSpec |
| `frontend/src/types/index.ts` | Add new WSEvent types, hardware config types |
| `frontend/src/hooks/useBuildSession.ts` | Handle flash_prompt/flash_complete/documentation_ready events |

## Quality Requirements

### Testing (Non-Negotiable)

Every module must have tests before the feature is considered complete. Test types:

**Unit tests:**
- MicroPython sensor classes: test each sensor class with mocked hardware (stub/fallback mode). Verify read values, edge cases (NaN filtering, interrupt debounce, cooldown timing).
- OLEDDisplay: test text rendering, clear, show_readings formatting.
- SensorNode/GatewayNode: test acquisition loop timing, LoRa packet format, HTTP POST payload format.
- NuggetSpec Zod schema: test validation accepts valid IoT configs, rejects invalid.
- Block interpreter: test each new block type produces correct NuggetSpec fields.
- CloudDeployService: mock gcloud CLI, verify Dockerfile generation, deploy command construction.
- FlashWizardModal: render tests for each flash step state.

**Integration tests:**
- Deploy phase IoT flow: mock hardwareService + cloudDeployService, verify full flash sequence (cloud -> sensor -> gateway), correct gate events emitted.
- Agent prompt injection: verify IoT context appears in builder prompt when NuggetSpec has hardware.devices.
- Block interpreter end-to-end: full workspace with IoT blocks -> complete NuggetSpec with hardware config.
- Event flow: verify flash_prompt -> gate response -> flash_complete event sequence.

**Behavioral tests:**
- Full build session with IoT NuggetSpec: mock agent responses, verify orchestrator produces correct code files and deploy sequence.
- Documentation generation: verify write_guide block triggers post-build doc agent task.
- Multi-device coordination: verify sensor and gateway code share matching LoRa protocol.

### MicroPython Hardware Reliability

The MicroPython code must be **bulletproof**. Failure on-device is hard to debug remotely.

**Mandatory reliability patterns:**
- Every sensor read wrapped in try/except with fallback values (never crash on bad read)
- DHT22: filter NaN/out-of-range values (temp: -40 to 80C, humidity: 0-100%). Retry once on bad read before returning last-known-good.
- Reed switch: hardware debounce via 50ms interrupt cooldown. No false triggers from electrical noise.
- PIR: respect HC-SR501's 2-second retrigger lockout. Don't poll faster than hardware can respond.
- LoRa: fixed-size packet format with checksum. Retry on send failure (up to 2 retries). Graceful handling of corrupted/truncated received packets.
- OLED: initialize with reset pulse (Heltec requires OLED RST pin 21 toggle). Handle I2C timeout gracefully.
- WiFi: auto-reconnect loop on disconnect. Exponential backoff (1s, 2s, 4s, max 30s). Don't block sensor acquisition while reconnecting.
- HTTP POST: timeout (10s), retry (2 attempts), queue failed posts in memory (up to 100 entries) for retry on reconnect.
- Memory: MicroPython has ~100KB free heap on ESP32. Keep data structures minimal. No unbounded lists.
- Watchdog: enable hardware watchdog timer (WDT) with 60s timeout. Feed in main loop. Auto-reset if firmware hangs.

**Pin configuration validation:**
- Library constructor validates pin numbers against known-good ranges for Heltec V3.
- Warn (print) if pins conflict with board-reserved pins (LoRa SPI, OLED I2C, USB).

**Template verification:**
- Each template must be tested on real hardware before merge (manual test, documented procedure).
- Templates include a self-test mode: `python sensor_node.py --test` that verifies sensor connectivity without starting the main loop.

### Documentation Package

**Architecture updates:**
- Update `ARCHITECTURE.md` with IoT data flow diagram and multi-device topology.
- Update `docs/INDEX.md` with new files, directories, and data flow.
- Update `backend/CLAUDE.md` with new API endpoints, WSEvent types, and cloudDeployService.
- Update `frontend/CLAUDE.md` and `frontend/src/components/CLAUDE.md` with new blocks and FlashWizardModal.

**New documentation:**
- `docs/iot-guide.md` - User guide: how to build an IoT sensor network in Elisa, hardware setup photos/diagrams, wiring guide, Cloud Run setup steps.
- `docs/api-reference.md` - Update with new hardware config endpoints and WSEvent types.
- Hardware library API reference in `hardware/README.md` (or create if missing).

## Branch Strategy

All work on `feature/iot-sensor-network` branched off `main`.
