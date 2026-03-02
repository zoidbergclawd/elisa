# Building the ESP32-S3-BOX-3 Voice Agent Firmware

This guide walks you through building the BOX-3 firmware from scratch after a fresh clone of the Elisa repo.

## Overview

The BOX-3 firmware is built by adapting Espressif's `chatgpt_demo` from the [esp-box](https://github.com/espressif/esp-box) repository. The Elisa scaffold replaces the direct OpenAI API calls with calls to the Elisa runtime server, so all AI processing stays server-side and API keys never touch the device.

## Quick Start

If you've already installed ESP-IDF:

```bash
. ~/esp/esp-idf/export.sh
cd devices/esp32-s3-box3-agent
./build-firmware.sh
```

The binary lands at `devices/esp32-s3-box3-agent/firmware/box3-agent.bin`.

## Full Setup (from scratch)

### 1. Install ESP-IDF

```bash
mkdir -p ~/esp && cd ~/esp
git clone --recursive -b v5.3.2 https://github.com/espressif/esp-idf.git
cd esp-idf
./install.sh esp32s3
```

This installs the Xtensa toolchain, CMake, and Python dependencies (~2 GB).

### 2. Source ESP-IDF (every terminal session)

```bash
. ~/esp/esp-idf/export.sh
```

Add this to your shell profile if you build firmware frequently.

### 3. Build the firmware

```bash
cd /path/to/elisa/devices/esp32-s3-box3-agent
./build-firmware.sh
```

The script will:
1. Clone `esp-box` to `~/esp/esp-box` (if not already present)
2. Copy `chatgpt_demo` to `~/esp/elisa_agent` as the build base
3. Copy the Elisa scaffold files (`elisa_config.c`, `elisa_api.c`, `elisa_face.c`, `elisa_main.c`)
4. Patch `CMakeLists.txt` to include Elisa sources
5. Set the ESP32-S3 target and build
6. Copy the binary to `firmware/box3-agent.bin`

First build takes 3-10 minutes. Subsequent builds are much faster (incremental).

### 4. Verify

```bash
ls -la firmware/box3-agent.bin
# Should exist and be ~1-2 MB
```

## What the Firmware Does

```
Boot
 ├── Load runtime_config.json from SPIFFS
 │   (agent_id, api_key, runtime_url, WiFi creds, wake word, face descriptor)
 ├── Connect to WiFi
 ├── Call /v1/agents/:id/heartbeat to verify runtime is reachable
 ├── Initialize LVGL face renderer (from face_descriptor)
 └── Enter conversation loop:
      ├── Wait for wake word (ESP-SR, offline)
      ├── Face → LISTENING state
      ├── Capture audio from dual MEMS microphones
      ├── POST audio to /v1/agents/:id/turn/audio
      │   (runtime does: Whisper STT → Claude → TTS)
      ├── Face → THINKING while waiting
      ├── Receive text + MP3 audio response
      ├── Face → SPEAKING
      ├── Play audio through speaker
      └── Face → IDLE
```

## Architecture: What's Elisa vs. What's chatgpt_demo

| Component | chatgpt_demo | Elisa adaptation |
|-----------|-------------|------------------|
| Audio I/O (mic + speaker) | `app_audio.c` | **Kept as-is** |
| Wake word (ESP-SR) | `app_sr.c` | **Kept as-is** |
| WiFi connection | `app_wifi.c` + Kconfig | **Replaced**: reads from `runtime_config.json` via `elisa_config.c` |
| API calls | 3 separate OpenAI calls | **Replaced**: single call to Elisa runtime via `elisa_api.c` |
| Display UI | Text chat UI | **Replaced**: animated face renderer via `elisa_face.c` |
| Configuration | Kconfig menuconfig | **Replaced**: JSON config from SPIFFS via `elisa_config.c` |

## Scaffold Files

| File | Purpose |
|------|---------|
| `elisa_config.h/c` | Loads `runtime_config.json` from SPIFFS, parses face descriptor |
| `elisa_api.h/c` | HTTP client for Elisa runtime (`/v1/agents/:id/turn/audio`, `/heartbeat`) |
| `elisa_face.h/c` | LVGL face renderer with state machine (idle/listening/thinking/speaking/error) |
| `elisa_main.c` | Boot sequence, WiFi init, conversation loop |

## Flashing

### Via Elisa (recommended)

1. Build your agent in the Blockly workspace
2. Click GO → build runs → deploy phase starts
3. FlashWizardModal prompts you to connect the BOX-3 via USB-C
4. EsptoolFlashStrategy flashes the binary and writes `runtime_config.json`

### Manual flash

```bash
. ~/esp/esp-idf/export.sh
cd ~/esp/elisa_agent
idf.py -p /dev/tty.usbmodem* flash
```

Or with esptool directly:

```bash
esptool.py --chip esp32s3 --port /dev/tty.usbmodem* --baud 460800 \
    write_flash 0x0 devices/esp32-s3-box3-agent/firmware/box3-agent.bin
```

## Troubleshooting

### `cmake not found`
Install cmake: `brew install cmake` (macOS) or `apt install cmake` (Linux)

### `idf.py not found`
Source ESP-IDF: `. ~/esp/esp-idf/export.sh`

### Build fails with missing components
The chatgpt_demo depends on esp-box BSP components that are fetched via `idf_component.yml`. If the component manager fails, try:
```bash
cd ~/esp/elisa_agent
idf.py reconfigure
idf.py build
```

### Flash fails with `serial port not found`
- Make sure the BOX-3 is connected via USB-C
- Check: `ls /dev/tty.usb*` (macOS) or `ls /dev/ttyUSB*` (Linux)
- Try a different USB-C cable (some are charge-only)

### `OPENAI_API_KEY` not set
The firmware doesn't need an OpenAI key — all AI calls go through the Elisa runtime. Set `OPENAI_API_KEY` in the Elisa backend environment, not on the device.

## Environment Variables (Elisa backend)

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | Yes | Claude API for agent conversations |
| `OPENAI_API_KEY` | Yes (for voice) | Whisper STT + TTS |
| `PORT` | No (default: 8000) | Runtime API port |

## Related Files

- `devices/esp32-s3-box3-agent/device.json` — Device manifest (Blockly blocks, deploy config)
- `devices/esp32-s3-box3-agent/prompts/agent-context.md` — Builder agent context
- `backend/src/services/runtime/audioPipeline.ts` — Server-side STT/TTS
- `backend/src/services/flashStrategy.ts` — EsptoolFlashStrategy
