# ESP32-S3-BOX-3 Voice Agent Plugin

Device plugin for running an Elisa AI voice agent on the [ESP32-S3-BOX-3](https://github.com/espressif/esp-box) hardware. The device provides a touchscreen face, microphone, speaker, and WiFi -- everything needed for a physical AI companion.

## What This Plugin Does

This plugin integrates the BOX-3 into the Elisa build pipeline:

1. **Blockly blocks** -- Two blocks are registered in the workspace:
   - **S3 BOX Voice Agent**: Configure agent name, wake word, TTS voice, and WiFi credentials.
   - **BOX Display**: Choose a display theme and toggle listening indicator / transcription.

2. **Agent provisioning** -- On deploy, the Elisa runtime provisions an agent identity (agent_id, api_key, runtime_url) so the device can authenticate with the server.

3. **Firmware flash** -- The deploy pipeline uses `esptool` to flash the firmware binary and write `runtime_config.json` (containing agent identity, WiFi, face design, and theme) to the device's SPIFFS partition.

4. **Face rendering** -- Kids design their agent's face in the Art Agent Studio meeting. The `FaceDescriptor` is written to runtime config and rendered on the touchscreen via LVGL.

5. **Audio turns** -- The device captures audio via dual MEMS microphones, sends it to the Elisa runtime's `/v1/agents/:id/turn/audio` endpoint, and plays back the TTS response through the onboard speaker. All AI processing stays server-side.

## Setup

### Prerequisites

- Elisa app installed and running (`npm install && npm run dev:electron`)
- `ANTHROPIC_API_KEY` set in the environment
- `OPENAI_API_KEY` set for audio features (STT/TTS)
- ESP32-S3-BOX-3 connected via USB-C (use the **back port** on the dock, not the front)
- `esptool.py` installed (`pip install esptool`) or bundled with ESP-IDF

### Quick Start

1. Open the Elisa app and create a new workspace.
2. Drag the **S3 BOX Voice Agent** block onto the canvas.
3. Fill in your WiFi network name and password.
4. (Optional) Add a **BOX Display** block to customize the theme.
5. Click **GO** to build. The agents will design your agent's personality.
6. When the Art Agent meeting appears, design your agent's face.
7. The Flash Wizard guides you through connecting and flashing the device.
8. Once the heartbeat confirms the device is online, say the wake word to start talking!

## Blockly Blocks

### S3 BOX Voice Agent

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| AGENT_NAME | text | My Agent | Name shown on screen and used in prompts |
| WAKE_WORD | dropdown | Hey Elisa | Offline wake word (ESP-SR) |
| TTS_VOICE | dropdown | Nova | OpenAI TTS voice for responses |
| WIFI_SSID | text | (empty) | WiFi network name |
| WIFI_PASSWORD | text | (empty) | WiFi password |

### BOX Display

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| DISPLAY_THEME | dropdown | Elisa Blue | Screen color theme |
| SHOW_LISTENING | checkbox | true | Show listening indicator ring |
| SHOW_TRANSCRIPTION | checkbox | true | Show live transcription text |

## Flash Process

The deploy pipeline handles flashing automatically:

1. **Runtime provisioning** -- `RuntimeProvisioner.provision()` creates an agent identity in the Elisa runtime and returns `agent_id`, `api_key`, and `runtime_url`.

2. **Firmware binary** -- `EsptoolFlashStrategy` resolves `esptool`, detects the serial port, and flashes `firmware/box3-agent.bin` at offset `0x0` with baud rate 460800.

3. **Runtime config** -- After flashing, `runtime_config.json` is written to SPIFFS with all configuration: agent identity, WiFi credentials, wake word, display theme, and face descriptor.

4. **Heartbeat check** -- The Flash Wizard polls `GET /v1/agents/:id/heartbeat` until the device comes online, confirming the flash was successful.

### Redeploy

When you modify and rebuild, the `RedeployClassifier` determines whether a full firmware reflash is needed or just a config update:
- **config_only**: Only `runtime_config.json` changes (e.g., new theme, new agent name).
- **firmware_required**: Structural changes require reflashing the binary.

## Firmware Build (Advanced)

The `firmware/` directory contains C source scaffolds that adapt the esp-box `chatgpt_demo` example for Elisa. See `firmware/README.md` for detailed build instructions.

Key source files:
- `elisa_main.c` -- Entry point and boot sequence
- `elisa_config.c/h` -- Loads `runtime_config.json` from SPIFFS
- `elisa_api.c/h` -- HTTP client for Elisa runtime API
- `elisa_face.c/h` -- LVGL face renderer with state machine (idle/listening/thinking/speaking)

### Building from Source

```bash
# Requires ESP-IDF v5.1+ and esp-box BSP
git clone --recursive https://github.com/espressif/esp-box.git
cp -r esp-box/examples/chatgpt_demo esp-box/elisa_agent
cp devices/esp32-s3-box3-agent/firmware/main/elisa_*.{c,h} esp-box/elisa_agent/main/
cd esp-box/elisa_agent
idf.py set-target esp32s3
idf.py build
```

The output binary at `build/elisa_agent.bin` replaces `firmware/box3-agent.bin`.

## Plugin Manifest

The `device.json` manifest defines:
- Board detection via USB VID/PID (`0x303A:0x1001`)
- Capabilities: microphone, speaker, touchscreen, WiFi, GPIO, wake word, runtime client
- Deploy method: `esptool` with runtime provisioning
- Spec mapping: extracts `AGENT_NAME`, `TTS_VOICE`, and `DISPLAY_THEME` into the NuggetSpec runtime config

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Device not detected | Use the **back** USB-C port (data+power). The front port is power-only. |
| Flash fails with timeout | Try a different USB cable. Some cables are charge-only. |
| Agent doesn't respond after flash | Check WiFi credentials. The device needs internet to reach the runtime. |
| No audio playback | Verify `OPENAI_API_KEY` is set on the server for TTS. |
| Wake word not triggering | Speak clearly and within 1-2 meters. Try "Hey Elisa" with a pause after "Hey". |
