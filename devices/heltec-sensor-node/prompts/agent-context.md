# Heltec Sensor Node — Agent Context

You are building MicroPython code for an ESP32 sensor node (Heltec WiFi LoRa V3). Use the Elisa hardware library classes below.

## Sensor Classes (from sensors.py)

| Class | Constructor | Methods |
|-------|------------|---------|
| DHT22Sensor(pin) | pin: GPIO number (default 13) | .read() -> {temperature, humidity}. Retries once, returns last-known-good on failure. |
| ReedSwitch(pin) | pin: GPIO number (default 12) | .is_open() -> bool. .on_change(callback). .events_since(reset=True) -> bool. 50ms debounce. |
| PIRSensor(pin) | pin: GPIO number (default 14) | .is_motion() -> bool. .on_motion(callback). .events_since(reset=True) -> bool. 2s cooldown. |

## Display Class (from oled.py)

| Class | Constructor | Methods |
|-------|------------|---------|
| OLEDDisplay(sda, scl, rst, w, h) | Heltec V3 defaults: sda=17, scl=18, rst=21, 128x64 | .text(str, x, y). .clear(). .show(). .draw_bar(label, val, max, y). .show_readings(dict). |

## SensorNode Class (from nodes.py)

| Class | Constructor | Methods |
|-------|------------|---------|
| SensorNode(sensors, lora_channel, display, board) | List of sensors, channel, optional display, board | .start(interval_sec=10) — runs acquisition loop forever |

## Pin Mapping (Heltec WiFi LoRa V3)

| Function | Pin | Notes |
|----------|-----|-------|
| OLED SDA | GPIO 17 | Heltec onboard I2C |
| OLED SCL | GPIO 18 | Heltec onboard I2C |
| OLED RST | GPIO 21 | Heltec OLED reset |
| DHT22 | GPIO 13 | Configurable |
| Reed switch | GPIO 12 | Configurable |
| PIR | GPIO 14 | Configurable |
| LED | GPIO 35 | Existing |

## MicroPython Pitfalls

- Use `import urequests` not `import requests`
- Use `time.sleep_ms()` for millisecond delays
- Use `from machine import Pin` for GPIO
- Built-in `dht` module for DHT22 (no pip install)
- Memory is limited (~100KB free heap). Keep data structures small.
- Always wrap hardware reads in try/except
- NEVER use emoji or unicode characters beyond ASCII. MicroPython on ESP32 has limited encoding support.

## Code Generation Rules

- Generate `sensor_main.py` as the entry point
- Import from `elisa_hardware`, `sensors`, `oled`, `nodes` — these libraries are pre-loaded on the device
- DO NOT attempt to deploy or flash — a separate deploy phase handles that
- DO NOT generate the library files (sensors.py, oled.py, etc.) — only generate main scripts
