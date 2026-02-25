# Elisa Hardware Library

MicroPython classes and templates for building IoT sensor networks on Heltec WiFi LoRa 32 V3. The library provides graceful degradation, robust error handling, and stub mode for testing without hardware.

## Table of Contents

- [Library Overview](#library-overview)
- [Supported Hardware](#supported-hardware)
- [Installation](#installation)
- [Class API Reference](#class-api-reference)
- [Pin Mapping](#pin-mapping)
- [Templates](#templates)
- [Manual Test Procedure](#manual-test-procedure)
- [Design Principles](#design-principles)

## Library Overview

The Elisa hardware library provides production-ready abstractions for IoT deployments:

- **Board abstraction** (`ElisaBoard`) - LED, button, LoRa transceiver, and buzzer control
- **Sensor classes** - DHT22, magnetic reed switch, and PIR motion sensor with graceful degradation
- **Display driver** - SSD1306 OLED output with convenience methods for sensor readings
- **Node orchestration** - `SensorNode` (acquire + broadcast) and `GatewayNode` (receive + cloud relay)
- **Stub mode** - All classes work without hardware, returning sensible defaults for testing

## Supported Hardware

### Heltec WiFi LoRa 32 V3 (Primary Target)

The main target board:
- **Microcontroller**: ESP32-S3 with 384 KB SRAM
- **Wireless**: Built-in LoRa (SX1262 @ 915 MHz) and WiFi (802.11b/g/n)
- **Display**: SSD1306 OLED (128x64, I2C-connected)
- **On-board peripherals**: LED (GPIO 35), push button (GPIO 0), buzzer (GPIO 2)

### External Sensors

| Sensor | Type | Default Pin | Protocol | Notes |
|--------|------|-------------|----------|-------|
| DHT22 / AM2302 | Temp + Humidity | 13 | Single-wire | Requires retry logic for reliability |
| Magnetic Reed Switch | Binary (door/window) | 12 | GPIO (normally closed) | 50ms debounce |
| HC-SR501 | PIR Motion | 14 | GPIO (active high) | 2s cooldown per sensor spec |

## Installation

1. **Copy library files to device**:
   ```bash
   # Via mpremote (recommended for Heltec V3)
   mpremote cp lib/elisa_hardware.py :/
   mpremote cp lib/sensors.py :/lib/
   mpremote cp lib/oled.py :/lib/
   mpremote cp lib/ssd1306.py :/lib/
   mpremote cp lib/nodes.py :/lib/
   ```

2. **Copy a template** (sensor node or gateway):
   ```bash
   mpremote cp templates/sensor_node.py :/main.py
   ```

3. **Set WiFi credentials** (for gateway):
   ```bash
   # Edit main.py to replace:
   #   WIFI_SSID = "YourNetworkName"
   #   WIFI_PASS = "YourPassword"
   #   CLOUD_URL = "https://your-api.run.app/ingest"
   #   API_KEY = "your-secret-key"
   ```

4. **Reboot device**:
   ```bash
   mpremote repl
   # >>> import machine; machine.reset()
   ```

## Class API Reference

### ElisaBoard

Board abstraction for Heltec V3 peripherals (LED, button, LoRa, buzzer).

```python
from elisa_hardware import ElisaBoard

board = ElisaBoard()

# LED control
board.led_on()
board.led_off()
board.led_blink(times=5, speed="normal")  # "slow" | "normal" | "fast"

# Button interrupt
def on_press():
    print("Button pressed!")
board.on_button_press(on_press)

# LoRa send (fails gracefully in stub mode)
board.send_message("Hello", channel=1)

# LoRa receive
def on_lora_msg(msg, channel):
    print(f"[ch{channel}] {msg}")
board.on_message(on_lora_msg, channel=1)

# Buzzer tone (falls back to print if unavailable)
board.play_tone(freq=1000, duration=0.5)
```

**Pin Mapping**:
- LED: GPIO 35
- Button: GPIO 0 (BOOT pin, active low)
- LoRa SPI: GPIOs 8-11 (reserved)
- Buzzer: GPIO 2

---

### DHT22Sensor

Temperature and humidity sensor with validation and retry logic.

```python
from sensors import DHT22Sensor

dht = DHT22Sensor(pin=13)

# Returns dict with 'temperature' (°C) and 'humidity' (%)
# Filters invalid reads, retries once, returns last-known-good on failure
reading = dht.read()
print(f"Temp: {reading['temperature']:.1f}°C")
print(f"Humidity: {reading['humidity']:.1f}%")
```

**Behavior**:
- Valid range: -40°C to +80°C, 0-100% humidity
- NaN values rejected (sensor checksum error)
- Retry once with 250ms delay before returning last-known-good
- Stub mode: returns `{temperature: 0.0, humidity: 0.0}`

---

### ReedSwitch

Magnetic reed switch for door/window open detection with event tracking.

```python
from sensors import ReedSwitch

reed = ReedSwitch(pin=12)

# Instantaneous state
if reed.is_open():
    print("Door is open")

# Event tracking (debounced)
def on_state_change(is_open):
    state = "opened" if is_open else "closed"
    print(f"Door {state}")

reed.on_change(on_state_change)

# Check if event occurred since last check
if reed.events_since(reset=True):
    print("Door was opened/closed")
```

**Behavior**:
- Pin reads HIGH = open (magnet removed), LOW = closed (magnet present)
- 50ms debounce on interrupts to filter electrical noise
- `events_since()` tracks state changes across polling intervals
- Stub mode: always returns `False` (closed)

---

### PIRSensor

HC-SR501 PIR motion sensor with cooldown matching hardware specifications.

```python
from sensors import PIRSensor

pir = PIRSensor(pin=14, cooldown_ms=2000)

# Instantaneous state
if pir.is_motion():
    print("Motion detected now")

# Event callback (rate-limited by cooldown)
def on_motion():
    print("Motion event!")

pir.on_motion(on_motion)

# Check if event occurred since last check
if pir.events_since(reset=True):
    print("Motion detected in interval")
```

**Behavior**:
- Pin reads HIGH = motion detected, LOW = no motion
- 2-second cooldown (HC-SR501 retrigger time) prevents duplicate events
- `events_since()` captures motion within polling interval
- Stub mode: always returns `False` (no motion)

---

### OLEDDisplay

SSD1306 OLED display driver with convenience methods for sensor output.

```python
from oled import OLEDDisplay

display = OLEDDisplay(sda=17, scl=18, rst=21)

# Text output
display.clear()
display.text("Hello", x=0, y=0, color=1)
display.text("World", x=0, y=10, color=1)
display.show()

# Draw bar graphs
display.clear()
display.draw_bar("Temp", value=22.5, max_val=40, y=0)
display.draw_bar("Humidity", value=55, max_val=100, y=10)
display.show()

# Auto-format sensor readings
readings = {
    'dht22': {'temperature': 22.5, 'humidity': 55.0},
    'reed': {'door_opened': False},
    'pir': {'motion_detected': True},
    'ts': 1234567890
}
display.show_readings(readings)
```

**Behavior**:
- Buffered drawing (call `show()` to flush to hardware)
- Text auto-truncates to screen width (8 pixels per character)
- Pin defaults for Heltec V3: SDA=17, SCL=18, RST=21 (hardware reset required)
- Stub mode: prints output instead of displaying

---

### SensorNode

Orchestrates multi-sensor acquisition, LoRa broadcast, and OLED display updates.

```python
from elisa_hardware import ElisaBoard
from sensors import DHT22Sensor, ReedSwitch, PIRSensor
from oled import OLEDDisplay
from nodes import SensorNode

board = ElisaBoard()
dht = DHT22Sensor(pin=13)
reed = ReedSwitch(pin=12)
pir = PIRSensor(pin=14)
display = OLEDDisplay()

node = SensorNode(
    sensors=[dht, reed, pir],
    lora_channel=1,
    display=display,
    board=board
)

# Runs forever: polls sensors every 10 seconds, sends over LoRa, updates display
node.start(interval_sec=10)
```

**Behavior**:
- Polls all sensors in interval
- Packs readings into JSON with timestamp
- Sends over LoRa with checksum and 3 retries
- Updates OLED display if present
- Enables 60s watchdog timer to auto-reset on hang
- Collects events from reed switch and PIR since last interval

**Output Format**:
```json
{
  "ts": 1708885234,
  "dht22": {
    "temperature": 22.5,
    "humidity": 55.0
  },
  "reed": {
    "door_opened": false
  },
  "pir": {
    "motion_detected": true
  }
}
```

---

### GatewayNode

Receives LoRa messages, validates checksum, and relays to cloud via WiFi and HTTP.

```python
from elisa_hardware import ElisaBoard
from nodes import GatewayNode

board = ElisaBoard()

gateway = GatewayNode(
    lora_channel=1,
    wifi_ssid="YourNetwork",
    wifi_pass="password",
    cloud_url="https://your-api.run.app/ingest",
    api_key="secret-key-here",
    board=board
)

# Runs forever: listens for LoRa, POSTs to cloud, handles WiFi reconnection
gateway.start()
```

**Behavior**:
- Listens for LoRa packets on specified channel
- Validates packet checksum (format: `<hex_checksum>|<json_payload>`)
- Retries HTTP POST 2 times with 10s timeout per request
- Queues failed POSTs (up to 100) for retry when WiFi reconnects
- WiFi reconnection with exponential backoff (1s → 30s max)
- Enables 60s watchdog timer
- Discards old queued messages if queue overflows

**HTTP Request**:
```
POST https://your-api.run.app/ingest
Content-Type: application/json
X-API-Key: secret-key-here

{
  "ts": 1708885234,
  "dht22": { ... },
  "reed": { ... },
  "pir": { ... }
}
```

## Pin Mapping

Reference for Heltec WiFi LoRa 32 V3 pin assignments.

| Pin | Signal | Function | Reserved? | Notes |
|-----|--------|----------|-----------|-------|
| 0 | BUTTON | On-board push button (active low) | **Yes** | BOOT pin during flashing |
| 2 | BUZZER | Piezo buzzer PWM | Yes | Configure if using buzzer |
| 8 | LoRa CS | SPI chip select | **Yes** | SX1262 LoRa driver |
| 9 | LoRa CLK | SPI clock | **Yes** | SX1262 LoRa driver |
| 10 | LoRa MOSI | SPI data out | **Yes** | SX1262 LoRa driver |
| 11 | LoRa MISO | SPI data in | **Yes** | SX1262 LoRa driver |
| 12 | *Default Reed* | Generic GPIO | Available | Magnetic switch (example) |
| 13 | *Default DHT22* | Generic GPIO | Available | Temperature sensor (example) |
| 14 | *Default PIR* | Generic GPIO | Available | Motion sensor (example) |
| 17 | OLED SDA | I2C data | **Yes** | On-board SSD1306 display |
| 18 | OLED SCL | I2C clock | **Yes** | On-board SSD1306 display |
| 21 | OLED RST | Reset (active low) | **Yes** | On-board SSD1306 display |
| 35 | LED | On-board RGB LED | **Yes** | Status indicator |

**Available GPIO for additional sensors**: 3-7, 12, 13, 14, 15, 16, 19, 20, 22-34, 36-48

---

## Templates

Ready-to-deploy examples in `templates/`.

### Sensor Node (`sensor_node.py`)

Acquires sensor data, broadcasts over LoRa, displays on OLED.

**Usage**:
```bash
# Normal operation (broadcast every 10 seconds)
mpremote run sensor_node.py

# Self-test (verify all sensors are responding)
mpremote run sensor_node.py --test
```

**Configuration** (edit lines 19-20):
```python
LORA_CHANNEL = 1
BROADCAST_INTERVAL = 10  # seconds
```

**Output**:
```
Elisa IoT Sensor Node -- starting!
[SensorNode] Starting (interval=10s, ch=1)
[DHT22] {temperature: 22.5, humidity: 55.0}
[LoRa TX ch1] <checksum>|<json_payload>
```

---

### Gateway Node (`gateway_node.py`)

Receives LoRa data from sensors, validates checksums, and POSTs to cloud dashboard.

**Usage**:
```bash
# Normal operation (listen and forward)
mpremote run gateway_node.py

# Self-test (verify WiFi connectivity)
mpremote run gateway_node.py --test
```

**Configuration** (edit lines 16-20):
```python
LORA_CHANNEL = 1
WIFI_SSID = "YourNetworkName"
WIFI_PASS = "YourPassword"
CLOUD_URL = "https://your-cloud-endpoint.run.app/data"
API_KEY = "your-api-key"
```

**Output**:
```
Elisa IoT Gateway Node -- starting!
[Gateway] Starting (ch=1)
[Gateway] Connecting to WiFi 'YourNetwork'...
[Gateway] WiFi connected: 192.168.1.42
[Gateway] Received: {ts: 1708885234, dht22: {...}, ...}
```

---

### Cloud Dashboard (`cloud_dashboard/`)

Express.js + Server-Sent Events dashboard for real-time sensor visualization.

**Structure**:
```
cloud_dashboard/
├── server.js          # Express server with /ingest endpoint
├── package.json       # Node.js dependencies
├── public/index.html  # Real-time dashboard UI
└── Dockerfile         # Cloud Run deployment
```

**Deployment**:
```bash
# Build and push to Cloud Run
docker build -t gcr.io/PROJECT_ID/elisa-dashboard .
docker push gcr.io/PROJECT_ID/elisa-dashboard

gcloud run deploy elisa-dashboard \
  --image gcr.io/PROJECT_ID/elisa-dashboard \
  --platform managed \
  --region us-central1
```

**Environment Variables**:
```bash
API_KEY=your-secret-key  # Validated in /ingest endpoint
```

**API Endpoint**:
```
POST /ingest
Content-Type: application/json
X-API-Key: your-secret-key

{
  "ts": 1708885234,
  "dht22": {"temperature": 22.5, "humidity": 55.0},
  "reed": {"door_opened": false},
  "pir": {"motion_detected": true}
}
```

Response: `{status: "ok"}`

---

## Manual Test Procedure

### 1. Self-Test Mode (No External Sensors Needed)

All classes support stub mode when hardware is unavailable. Test them:

```python
# test_sensors.py
from elisa_hardware import ElisaBoard
from sensors import DHT22Sensor, ReedSwitch, PIRSensor
from oled import OLEDDisplay

print("=== Elisa Hardware Self-Test ===")

board = ElisaBoard()
print("[✓] ElisaBoard initialized")

dht = DHT22Sensor(pin=13)
print(f"[✓] DHT22: {dht.read()}")

reed = ReedSwitch(pin=12)
print(f"[✓] ReedSwitch: open={reed.is_open()}")

pir = PIRSensor(pin=14)
print(f"[✓] PIRSensor: motion={pir.is_motion()}")

display = OLEDDisplay()
display.text("Self-Test OK", 0, 0)
display.show()
print("[✓] OLEDDisplay working")

print("=== All sensors responding ===")
```

**Expected Output** (with hardware):
```
=== Elisa Hardware Self-Test ===
[✓] ElisaBoard initialized
[✓] DHT22: {'temperature': 22.5, 'humidity': 55.0}
[✓] ReedSwitch: open=False
[✓] PIRSensor: motion=False
[✓] OLEDDisplay working
=== All sensors responding ===
```

**Expected Output** (without hardware, stub mode):
```
=== Elisa Hardware Self-Test ===
[✓] ElisaBoard initialized
[DHT22] Stub mode (no hardware)
[✓] DHT22: {'temperature': 0.0, 'humidity': 0.0}
[ReedSwitch] Stub mode (no hardware)
[✓] ReedSwitch: open=False
[PIR] Stub mode (no hardware)
[✓] PIRSensor: motion=False
[OLED] Stub mode (no hardware)
[✓] OLEDDisplay working
=== All sensors responding ===
```

---

### 2. Sensor Node Self-Test

Test with included template:

```bash
# Copy template to device
mpremote cp templates/sensor_node.py :/test_sensor.py

# Run self-test
mpremote run /test_sensor.py --test
```

**Expected Output**:
```
=== Sensor Self-Test ===
DHT22: {'temperature': 22.5, 'humidity': 55.0}
Reed:  open=False
PIR:   motion=False
=== All sensors responding ===
```

**If sensors fail**:
- Check pin assignments match hardware
- Verify sensor wiring (breadboard connections)
- Test individual sensors with minimal code
- Review GPIO voltage (3.3V for Heltec V3)
- Check for timing-sensitive issues (retry in a loop)

---

### 3. LoRa Broadcast Test

Verify sensor node broadcasts LoRa packets:

```python
# lora_receiver.py (on second board)
from elisa_hardware import ElisaBoard

board = ElisaBoard()

def on_msg(msg, ch):
    print(f"[ch{ch}] {msg}")

board.on_message(on_msg, channel=1)

import time
while True:
    time.sleep(1)
```

Run on both boards:
- **Board 1**: `mpremote run sensor_node.py`
- **Board 2**: `mpremote run lora_receiver.py`

**Expected output on Board 2**:
```
[ch1] 3a|{"ts": 1708885234, "dht22": {...}}
```

If no messages:
- Check LoRa module power and oscillator
- Verify SPI pins (8-11) are not conflicting
- Try `lora_hello.py` template first
- Ensure both boards on same channel (915 MHz)

---

### 4. Gateway WiFi Test

Verify gateway can connect to WiFi:

```bash
# Edit gateway_node.py with your WiFi credentials
WIFI_SSID = "YourNetwork"
WIFI_PASS = "password"

mpremote cp templates/gateway_node.py :/main.py
mpremote repl
# >>> import gateway_node
```

**Expected output**:
```
Elisa IoT Gateway Node -- starting!
[Gateway] Starting (ch=1)
[Gateway] Connecting to WiFi 'YourNetwork'...
[Gateway] WiFi connected: 192.168.1.123
```

**If WiFi fails**:
- Verify SSID and password are correct
- Check board is in range of router
- Try a 2.4 GHz network (not 5 GHz)
- Monitor gateway logs with `mpremote ls :` and `mpremote cat :/error.log`

---

### 5. Gateway Cloud POST Test

Verify gateway can POST to cloud endpoint:

```bash
# Start local echo server (for testing without Cloud Run)
# python -m http.server 8080

# Or use webhook.site for temporary public endpoint

# Edit gateway_node.py
CLOUD_URL = "http://192.168.1.100:8080/ingest"  # local test
API_KEY = "test-key"

mpremote cp templates/gateway_node.py :/main.py
mpremote repl
```

**Expected output**:
```
[Gateway] Received: {"ts": 1708885234, "dht22": {...}}
```

If POST fails:
- Verify cloud URL is reachable from the board's network
- Check API key is correct
- Review cloud endpoint logs for errors
- Test with curl first: `curl -X POST http://endpoint/ingest -H "X-API-Key: key" -d "{}"`

---

## Design Principles

The library follows these patterns for reliability:

### Graceful Degradation

All classes detect unavailable hardware and fall back to stub mode:

```python
# With hardware:
dht = DHT22Sensor(pin=13)
reading = dht.read()  # Returns real sensor data

# Without hardware (ImportError):
dht = DHT22Sensor(pin=13)
reading = dht.read()  # Returns {temperature: 0.0, humidity: 0.0}
```

### Input Validation

Sensor reads validate against known-good ranges:

```python
# DHT22: filters NaN and out-of-range values
-40°C to +80°C
0-100% humidity

# ReedSwitch and PIRSensor: debounce and cooldown
50ms debounce (reed), 2s cooldown (PIR)
```

### Retry and Last-Known-Good

DHT22 retries once with 250ms delay, then returns previous reading:

```python
# Attempt 1: read and validate
# Attempt 2 (if failed): read and validate after 250ms delay
# Failure: return last successful reading
```

### No Unbounded Memory

Queue structures are bounded:

```python
# GatewayNode post queue: max 100 entries
# Overflow: drop oldest message, add newest
```

### Watchdog Protection

Both SensorNode and GatewayNode enable 60s watchdog timer:

```python
# If device doesn't feed watchdog, auto-resets
# Prevents infinite loops, memory leaks, or network hangs
```

### Simple Checksums

LoRa packets include XOR checksum to detect corruption:

```python
# Format: <hex_checksum>|<json_payload>
# Example: 3a|{"ts": 1708885234, ...}
# Receiver validates: checksum must match payload
```
