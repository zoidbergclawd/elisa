# Heltec Sensor Node -- Agent Context

You are building MicroPython code for an ESP32 sensor node (Heltec WiFi LoRa V3/V4). Use the Elisa hardware library classes below.

## CRITICAL: Use Device Instance Fields for All Configuration

A `## Device Instance` section appears later in this prompt with the user's actual configuration values. You MUST use those values -- not the defaults listed in this document. The fields include:

- PIN_DHT22, PIN_REED, PIN_PIR -- GPIO pin numbers for each sensor
- SENSOR_DHT22, SENSOR_REED, SENSOR_PIR -- whether each sensor is enabled (true/false)
- HAS_OLED -- whether OLED display is enabled
- LORA_CHANNEL -- LoRa channel number
- INTERVAL -- broadcast interval in seconds

Example: if Device Instance says `PIN_DHT22: 7`, you must write `DHT22Sensor(pin=7)`, NOT `DHT22Sensor(pin=5)` or any other value.

## Sensor Classes (from sensors.py)

| Class | Constructor | Methods |
|-------|------------|---------|
| DHT22Sensor(pin) | pin: GPIO number from PIN_DHT22 field | .read() -> {temperature, humidity}. Retries once, returns last-known-good on failure. |
| ReedSwitch(pin) | pin: GPIO number from PIN_REED field | .is_open() -> bool. .on_change(callback). .events_since(reset=True) -> bool. 50ms debounce. |
| PIRSensor(pin) | pin: GPIO number from PIN_PIR field | .is_motion() -> bool. .on_motion(callback). .events_since(reset=True) -> bool. 2s cooldown. |

## Display Class (from oled.py)

| Class | Constructor | Methods |
|-------|------------|---------|
| OLEDDisplay(sda, scl, rst, w, h) | Heltec V3/V4 defaults: sda=17, scl=18, rst=21, 128x64 | .text(str, x, y). .clear(). .show(). .draw_bar(label, val, max, y). .show_readings(dict). |

## SensorNode Class (from nodes.py)

| Class | Constructor | Methods |
|-------|------------|---------|
| SensorNode(sensors, lora_channel, display, board) | List of sensors, channel, optional display, board | .start(interval_sec) -- runs acquisition loop forever |

## Pin Mapping (Heltec WiFi LoRa V3/V4)

GPIOs 8-14 are reserved for the SX1262 LoRa radio (SPI bus, IRQ, RST, GPIO). Do NOT use them for sensors.

| Function | Pin | Notes |
|----------|-----|-------|
| Vext power | GPIO 36 | LOW = power on for OLED/peripherals (handled by oled.py) |
| OLED SDA | GPIO 17 | Fixed, onboard I2C |
| OLED SCL | GPIO 18 | Fixed, onboard I2C |
| OLED RST | GPIO 21 | Fixed, toggled during init |
| LED | GPIO 35 | Onboard LED |
| LoRa SPI | GPIO 8-11 | Reserved: CS=8, CLK=9, MOSI=10, MISO=11 |
| LoRa control | GPIO 12-14 | Reserved: RST=12, GPIO=13, IRQ=14 |

Available header pins for sensors: 2, 3, 4, 5, 6, 7, 15, 16, 19, 20, 26, 33, 34, 38-42, 45-48.

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
- Import from `elisa_hardware`, `sensors`, `oled`, `nodes` -- these libraries are pre-loaded on the device
- Read ALL configuration from the `Device Instance` fields. Use those exact values for pin numbers, channel, interval, and sensor enable/disable flags.
- DO NOT attempt to deploy or flash -- a separate deploy phase handles that
- DO NOT generate the library files (sensors.py, oled.py, etc.) -- only generate main scripts
