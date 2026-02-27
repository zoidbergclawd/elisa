# Heltec Gateway -- Agent Context

You are building MicroPython code for an ESP32 gateway node (Heltec WiFi LoRa V3/V4). The gateway receives LoRa packets from sensor nodes and relays data to a cloud endpoint via WiFi/HTTP.

## CRITICAL: Use Device Instance Fields for All Configuration

A `## Device Instance` section appears later in this prompt with the user's actual configuration values. You MUST use those values -- not any defaults. The fields include:

- LORA_CHANNEL -- LoRa channel number
- WIFI_SSID, WIFI_PASS -- WiFi credentials

Cloud URL and API key are NOT in the Device Instance fields. They come from `config.py` which is written at flash time by the deploy phase. Import them like this:

```python
try:
    from config import CLOUD_URL, API_KEY
except ImportError:
    CLOUD_URL = ""
    API_KEY = ""
    print("[gateway_main] WARNING: config.py not found -- cloud POST disabled")
```

## GatewayNode Class (from nodes.py)

| Class | Constructor | Methods |
|-------|------------|---------|
| GatewayNode(lora_channel, wifi_ssid, wifi_pass, cloud_url, api_key, board, display) | LoRa channel, WiFi creds, cloud URL, API key, board, optional OLED display | .start() -- runs receive/relay loop forever |

## Display Class (from oled.py)

| Class | Constructor | Methods |
|-------|------------|---------|
| OLEDDisplay(sda, scl, rst, w, h) | Heltec V3/V4 defaults: sda=17, scl=18, rst=21, 128x64 | .text(str, x, y). .clear(). .show(). |

The gateway has an onboard OLED. Initialize it and pass it to GatewayNode so it can display status (WiFi, RX/TX counts).

## Pin Mapping (Heltec WiFi LoRa V3/V4)

GPIOs 8-14 are reserved for the SX1262 LoRa radio. Do NOT use them.

| Function | Pin | Notes |
|----------|-----|-------|
| Vext power | GPIO 36 | LOW = power on for OLED/peripherals |
| OLED SDA/SCL | GPIO 17/18 | Fixed, onboard I2C |
| LoRa SPI | GPIO 8-11 | Reserved |
| LoRa control | GPIO 12-14 | Reserved |

## Code Generation Rules

- Generate `gateway_main.py` as the entry point
- Import from `elisa_hardware`, `nodes`, `oled` -- these libraries are pre-loaded on the device
- Import `CLOUD_URL` and `API_KEY` from `config` module (written at flash time), with ImportError fallback
- Read LORA_CHANNEL, WIFI_SSID, WIFI_PASS from the `Device Instance` fields
- Initialize OLEDDisplay and pass as `display=` to GatewayNode
- Use `import urequests` not `import requests`
- NEVER use emoji or unicode characters beyond ASCII
- DO NOT attempt to deploy or flash -- a separate deploy phase handles that
- DO NOT generate the library files -- only generate main scripts
