# ESP32-S3-BOX-3 Agent Firmware

Firmware for the Elisa voice agent running on the ESP32-S3-BOX-3. Built by
adapting Espressif's `chatgpt_demo` from the
[esp-box](https://github.com/espressif/esp-box) repository.

## Overview

The firmware handles:
- **Wake word detection** via ESP-SR (offline, on-device)
- **Audio capture** from dual MEMS microphones via I2S
- **API communication** with the Elisa runtime (replaces direct OpenAI calls)
- **TTS playback** through the onboard speaker
- **Face rendering** on the 2.4" IPS touchscreen using LVGL

All AI processing happens server-side in the Elisa runtime. The device sends
raw audio and receives text + TTS audio back. API keys stay on the server.

## Prerequisites

- **ESP-IDF v5.1+** ([installation guide](https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/get-started/))
- **esp-box BSP** (Board Support Package for BOX-3 hardware)
- **Python 3.8+** (for ESP-IDF tools)
- **USB-C cable** connected to the BOX-3

Verify your ESP-IDF installation:

```bash
idf.py --version   # Should show v5.1.x or later
```

## Setup

### 1. Clone the esp-box repository

```bash
git clone --recursive https://github.com/espressif/esp-box.git
cd esp-box
```

### 2. Copy the chatgpt_demo as the base

```bash
cp -r examples/chatgpt_demo elisa_agent
cd elisa_agent
```

### 3. Set ESP-IDF target

```bash
idf.py set-target esp32s3
```

### 4. Apply Elisa modifications

Copy the scaffold source files from this directory into the project:

```bash
# From the Elisa repo root:
cp devices/esp32-s3-box3-agent/firmware/main/elisa_*.{c,h} \
   path/to/esp-box/elisa_agent/main/
```

### 5. Modify CMakeLists.txt

Add the Elisa source files to `main/CMakeLists.txt`:

```cmake
idf_component_register(
    SRCS
        "app_main.c"          # Rename to elisa_main.c or update entry point
        "elisa_config.c"
        "elisa_api.c"
        "elisa_face.c"
        # ... keep other chatgpt_demo sources you need (audio, WiFi helpers)
    INCLUDE_DIRS "."
    REQUIRES
        esp_http_client
        esp_spiffs
        nvs_flash
        esp_wifi
        json          # cJSON
        lvgl
        esp_sr
        bsp
)
```

## What to Modify in chatgpt_demo

### Replace: Direct API calls

**File:** `app_sr_handler.c` (or equivalent audio handler)

The chatgpt_demo makes three separate HTTP calls:
1. Audio -> OpenAI Whisper (STT)
2. Text -> ChatGPT (response)
3. Text -> OpenAI TTS (speech)

Replace all three with a single call:

```c
#include "elisa_api.h"

// Instead of chatgpt_demo's OpenAI calls:
elisa_turn_response_t response;
int ret = elisa_api_audio_turn(audio_data, audio_len, &response);
if (ret == 0) {
    // response.text has the agent's reply
    // response.audio_data has MP3 TTS audio
    play_audio(response.audio_data, response.audio_len);
}
elisa_api_free_response(&response);
```

### Replace: Kconfig WiFi credentials

**File:** `main/Kconfig.projbuild`

The chatgpt_demo reads WiFi from Kconfig (`CONFIG_ESP_WIFI_SSID`). Remove
those Kconfig entries. WiFi credentials come from `runtime_config.json`
written to SPIFFS by the Elisa deploy pipeline:

```c
#include "elisa_config.h"

// Instead of CONFIG_ESP_WIFI_SSID:
const elisa_runtime_config_t *config = elisa_get_config();
wifi_config.sta.ssid = config->wifi_ssid;
wifi_config.sta.password = config->wifi_password;
```

### Replace: Static UI with face renderer

**File:** `app_ui.c`

The chatgpt_demo shows a text-based chat UI. Replace it with the Elisa
face renderer:

```c
#include "elisa_face.h"

// After LVGL display init:
const face_descriptor_t *face = elisa_get_face_descriptor();
elisa_face_init(face);

// In audio handler callbacks:
elisa_face_set_state(FACE_STATE_LISTENING);  // wake word detected
elisa_face_set_state(FACE_STATE_THINKING);   // waiting for API
elisa_face_set_state(FACE_STATE_SPEAKING);   // playing TTS
elisa_face_set_state(FACE_STATE_IDLE);       // back to rest
```

### Add: SPIFFS partition for runtime config

**File:** `partitions.csv`

Add a SPIFFS partition for the runtime config file:

```csv
# Name,    Type, SubType, Offset,  Size
nvs,       data, nvs,     0x9000,  0x6000
phy_init,  data, phy,     0xf000,  0x1000
factory,   app,  factory, 0x10000, 0x300000
spiffs,    data, spiffs,  0x310000,0x50000
```

### Add: Runtime config loading on boot

**File:** `elisa_main.c` (replaces `app_main.c`)

The boot sequence in `elisa_main.c` initializes SPIFFS, loads config,
then proceeds with WiFi and audio init using config values. See the
scaffold file for the full flow.

## Runtime Configuration

The Elisa deploy pipeline writes `runtime_config.json` to the SPIFFS
partition. This file contains agent identity, WiFi credentials, and face
design parameters. See `runtime_config.schema.json` for the full schema.

Example config:

```json
{
  "agent_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "api_key": "eart_abc123def456",
  "runtime_url": "http://192.168.1.100:8000",
  "wifi_ssid": "MyNetwork",
  "wifi_password": "secret",
  "agent_name": "Buddy",
  "wake_word": "Hi Elisa",
  "display_theme": "default",
  "face_descriptor": {
    "base_shape": "round",
    "eyes": { "style": "circles", "size": "medium", "color": "#4361ee" },
    "mouth": { "style": "smile" },
    "expression": "happy",
    "colors": { "face": "#f0f0f0", "accent": "#ffb3ba" }
  }
}
```

## Building

```bash
cd path/to/esp-box/elisa_agent
idf.py build
```

The firmware binary will be at `build/elisa_agent.bin`.

## Flashing (manual)

```bash
idf.py -p /dev/ttyUSB0 flash
```

Or use `esptool.py` directly:

```bash
esptool.py --chip esp32s3 --port /dev/ttyUSB0 --baud 460800 \
    write_flash 0x0 build/elisa_agent.bin
```

## Flashing (via Elisa)

The Elisa app handles flashing automatically through the deploy pipeline:
1. Build your agent in the Blockly workspace
2. Click Deploy -- the FlashWizardModal guides you through USB connection
3. EsptoolFlashStrategy flashes the firmware binary and writes
   `runtime_config.json` to SPIFFS

## Architecture

```
elisa_main.c          Entry point, boot sequence, conversation loop
  |
  +-- elisa_config.c  Loads runtime_config.json from SPIFFS (cJSON)
  |
  +-- elisa_api.c     HTTP client for Elisa runtime API
  |                   POST /v1/agents/:id/turn/audio
  |                   GET  /v1/agents/:id/heartbeat
  |
  +-- elisa_face.c    LVGL face renderer with state machine
                      States: idle, listening, thinking, speaking, error
```

## Face Animation States

| State | Visual | Trigger |
|-------|--------|---------|
| Idle | Slow periodic blink, resting mouth | Default / after response |
| Listening | Wide eyes, pulsing ring around face | Wake word detected |
| Thinking | Eyes look around, bouncing dots below face | Waiting for API response |
| Speaking | Mouth animates with audio amplitude | Playing TTS audio |
| Error | Sad expression, red accent | API error or network issue |

## Supported Wake Words

The following wake words are supported by ESP-SR (dropdown options in
the Blockly block):

| Display Name | ESP-SR Model |
|--------------|-------------|
| Hey Elisa | hey_elisa |
| Hey Box | hey_box |
| Hi Alex | hi_alex |
| Hey Computer | hey_computer |

Custom wake words require training an ESP-SR model. See the
[ESP-SR documentation](https://github.com/espressif/esp-sr).
