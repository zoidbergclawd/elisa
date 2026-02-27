# ESP32-S3-BOX-3 Voice Agent -- Agent Context

You are building firmware for an ESP32-S3-BOX-3 AI voice agent. This device runs compiled firmware (ESP-IDF C/C++), NOT MicroPython scripts.

## CRITICAL: Use Device Instance Fields for All Configuration

A `## Device Instance` section appears later in this prompt with the user's actual configuration values. You MUST use those values -- not the defaults listed in this document. The fields include:

- WIFI_SSID -- WiFi network name for runtime connectivity
- WIFI_PASSWORD -- WiFi network password
- WAKE_WORD -- Wake word phrase that activates the voice agent

## Hardware Overview

| Component | Details |
|-----------|---------|
| Board | Espressif ESP32-S3-BOX-3 (dual-core Xtensa LX7, 240 MHz) |
| Flash | 16 MB |
| PSRAM | 8 MB (octal SPI) |
| Microphone | Dual MEMS microphones (ES7210 codec, I2S interface) |
| Speaker | 1W mono speaker (ES8311 codec, I2S interface) |
| Display | 2.4" IPS LCD, 320x240, ST7789 controller, SPI interface |
| Touch | Capacitive touch panel (GT911 controller, I2C) |
| Connectivity | WiFi 802.11 b/g/n, Bluetooth 5.0 LE |
| USB | USB-C (USB-Serial JTAG for programming and debug) |
| GPIO | Exposed via PMOD connectors and internal headers |

## Framework: ESP-IDF (NOT MicroPython)

This device uses the ESP-IDF framework (Espressif IoT Development Framework). Key differences from MicroPython devices:

- Code is written in C/C++ and compiled to binary firmware
- Use ESP-IDF components and APIs, not Python modules
- Memory management is manual (malloc/free or C++ RAII)
- Hardware drivers use ESP-IDF peripheral APIs (I2S, SPI, I2C, GPIO)
- WiFi uses the `esp_wifi` API
- Build system: CMake + idf.py

## Audio Pipeline

The BOX-3 voice agent uses this audio pipeline:

```
Microphone (I2S in)
  -> Voice Activity Detection (VAD, on-device)
  -> Audio capture buffer (ring buffer in PSRAM)
  -> WiFi POST to Agent Runtime (STT endpoint)
  -> Runtime processes speech -> generates response
  -> WiFi GET TTS audio from Runtime
  -> Audio playback buffer (ring buffer)
  -> Speaker (I2S out)
```

### Audio Components

| Component | ESP-IDF API | Notes |
|-----------|-------------|-------|
| Microphone input | `i2s_channel_read()` | ES7210 codec on I2S port 0, 16 kHz 16-bit mono for speech |
| Speaker output | `i2s_channel_write()` | ES8311 codec on I2S port 1, 16 kHz 16-bit mono for TTS playback |
| VAD | `esp_afe_sr` (ESP-SR) | On-device wake word detection + voice activity detection |
| Audio buffers | `xRingbufferCreate()` | Use PSRAM for large audio buffers (8 MB available) |

### Codec Configuration

```c
// ES7210 (microphone ADC) -- I2S port 0
i2s_std_config_t mic_config = {
    .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(16000),
    .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO),
    .gpio_cfg = {
        .bclk = GPIO_NUM_47,
        .ws = GPIO_NUM_45,
        .din = GPIO_NUM_46,
    },
};

// ES8311 (speaker DAC) -- I2S port 1
i2s_std_config_t spk_config = {
    .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(16000),
    .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO),
    .gpio_cfg = {
        .bclk = GPIO_NUM_17,
        .ws = GPIO_NUM_47,
        .dout = GPIO_NUM_15,
    },
};
```

## Display: LVGL UI

The touchscreen uses LVGL (Light and Versatile Graphics Library) for UI rendering.

| Aspect | Details |
|--------|---------|
| Library | LVGL v8.x via `esp_lvgl_port` |
| Resolution | 320x240 pixels |
| Controller | ST7789 (SPI) |
| Touch | GT911 capacitive (I2C) |
| Color depth | 16-bit RGB565 |
| Refresh | Flush via SPI DMA, double-buffered |

### UI States

The voice agent display shows different screens based on state:

1. **Idle** -- Clock/status display, WiFi signal indicator, "Say wake word" prompt
2. **Listening** -- Animated waveform visualization, "Listening..." text
3. **Processing** -- Spinning indicator, "Thinking..." text
4. **Speaking** -- Speaker animation, response text scrolling
5. **Error** -- Error icon, message, retry button

### Display Pin Configuration

```c
// ST7789 LCD -- SPI
#define LCD_SPI_HOST    SPI2_HOST
#define LCD_PIN_MOSI    GPIO_NUM_6
#define LCD_PIN_CLK     GPIO_NUM_7
#define LCD_PIN_CS      GPIO_NUM_5
#define LCD_PIN_DC      GPIO_NUM_4
#define LCD_PIN_RST     GPIO_NUM_48
#define LCD_PIN_BL      GPIO_NUM_47  // Backlight

// GT911 Touch -- I2C
#define TOUCH_PIN_SDA   GPIO_NUM_8
#define TOUCH_PIN_SCL   GPIO_NUM_18
#define TOUCH_PIN_INT   GPIO_NUM_3
```

## WiFi: Agent Runtime Connection

The BOX-3 connects to the Elisa Agent Runtime over WiFi. The runtime handles all AI processing (STT, LLM, TTS).

### Connection Flow

1. Connect to WiFi using WIFI_SSID and WIFI_PASSWORD from Device Instance
2. Perform runtime discovery (mDNS or configured URL from provisioning)
3. Register with runtime using provisioned agent_id and api_key
4. Enter main loop: listen -> capture -> send audio -> receive response -> play

### HTTP API (to Agent Runtime)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/agents/{agent_id}/audio` | POST | Send captured audio (PCM 16-bit, 16 kHz) |
| `/api/agents/{agent_id}/status` | GET | Check agent status, get pending responses |
| `/api/agents/{agent_id}/tts` | GET | Stream TTS audio response |
| `/api/agents/{agent_id}/config` | GET | Fetch runtime config (wake word model, etc.) |

### WiFi Configuration

```c
wifi_config_t wifi_config = {
    .sta = {
        .ssid = WIFI_SSID,          // From Device Instance
        .password = WIFI_PASSWORD,   // From Device Instance
        .threshold.authmode = WIFI_AUTH_WPA2_PSK,
    },
};
```

## Wake Word Detection

The ESP-SR library provides on-device wake word detection:

```c
// Configure AFE (Audio Front End) for wake word
afe_config_t afe_config = {
    .aec_init = true,              // Acoustic echo cancellation
    .se_init = true,               // Speech enhancement
    .vad_init = true,              // Voice activity detection
    .wakenet_init = true,          // Wake word detection
    .voice_communication_init = false,
    .wakenet_model_name = "wn9_hilexin",  // Configurable via WAKE_WORD
    .afe_mode = AFE_MODE_LOW_COST,
    .pcm_config = {
        .total_ch_num = 2,
        .mic_num = 2,
        .ref_num = 0,
        .sample_rate = 16000,
    },
};
```

### Wake Word Mapping

| User Setting | ESP-SR Model |
|-------------|-------------|
| hey_elisa | Custom model (provided in firmware) |
| hi_agent | Custom model (provided in firmware) |
| hello | wn9_hilexin (built-in) |

## Runtime Provisioning

This device requires Agent Runtime provisioning. During deploy, the runtime assigns:

- `agent_id` -- Unique identifier for this agent instance
- `api_key` -- Authentication key for runtime API access
- `runtime_url` -- URL of the Agent Runtime service

These are written to NVS (Non-Volatile Storage) on the device during the provisioning step after firmware flash.

## Code Generation Rules

- Generate ESP-IDF C/C++ code, NOT MicroPython or Arduino
- Use ESP-IDF v5.x APIs (current stable)
- Target the `esp32s3` chip with 16 MB flash and 8 MB PSRAM
- Use FreeRTOS tasks for concurrent operations (audio capture, playback, WiFi, UI)
- Store WiFi credentials and runtime config in NVS (Non-Volatile Storage)
- Use PSRAM for large buffers (audio ring buffers, LVGL frame buffers)
- Read ALL configuration from the Device Instance fields
- DO NOT attempt to flash or deploy -- a separate deploy phase handles that
- DO NOT generate build system files (CMakeLists.txt, sdkconfig) unless specifically needed
- Wrap all hardware initialization in error-checking macros (`ESP_ERROR_CHECK`)
- Use structured logging (`ESP_LOGI`, `ESP_LOGW`, `ESP_LOGE`)

## Task Architecture (FreeRTOS)

```
Task: audio_capture    (Priority 5, Core 0)  -- Microphone I2S read -> ring buffer
Task: wake_word_detect (Priority 5, Core 1)  -- ESP-SR AFE processing
Task: audio_playback   (Priority 4, Core 0)  -- Ring buffer -> Speaker I2S write
Task: wifi_comm        (Priority 3, Core 1)  -- HTTP to Agent Runtime
Task: ui_update        (Priority 2, Core 1)  -- LVGL display refresh
Task: main_loop        (Priority 1, Core 0)  -- State machine coordinator
```
