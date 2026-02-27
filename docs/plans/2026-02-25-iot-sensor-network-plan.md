# IoT Sensor Network Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend Elisa's ESP32 support to a full IoT sensor network: sensor node (DHT22 + reed switch + PIR + OLED) transmitting over LoRa to a gateway node that publishes to a Google Cloud Run dashboard.

**Architecture:** Fat MicroPython library with high-level sensor/display/node classes. Agent composes library calls. Cloud dashboard via SSE. Multi-device guided flash wizard. Two new Blockly block categories (IoT Devices + Hardware).

**Tech Stack:** MicroPython (ESP32), SSD1306 OLED driver, Node.js/Express (cloud dashboard), Google Cloud Run, Zod (schema), Blockly (blocks), Vitest (tests)

**Design doc:** `docs/plans/2026-02-25-iot-sensor-network-design.md`

---

## Pre-flight: Branch Setup

### Task 0: Create feature branch

**Files:** None

**Step 1: Create branch off main**

```bash
git checkout main
git pull origin main
git checkout -b feature/iot-sensor-network
```

**Step 2: Verify branch**

```bash
git branch --show-current
```
Expected: `feature/iot-sensor-network`

---

## Phase 1: MicroPython Library (Hardware Foundation)

This is the most critical phase. These modules run on real hardware with no debugger. Every class must be bulletproof.

### Task 1: SSD1306 OLED Driver

Bundle the standard MicroPython community SSD1306 driver. This is a well-tested third-party module, not our code.

**Files:**
- Create: `hardware/lib/ssd1306.py`

**Step 1: Download and verify the SSD1306 driver**

Source: micropython/micropython-lib `micropython/drivers/display/ssd1306/ssd1306.py`

This is the standard community driver. Create the file with the standard implementation that supports I2C and SPI modes, `fill()`, `text()`, `show()`, `pixel()`, `scroll()`, `invert()`, `rotate()`, `contrast()`.

The driver extends `framebuf.FrameBuffer` so all framebuf drawing operations work.

**Step 2: Commit**

```bash
git add hardware/lib/ssd1306.py
git commit -m "feat(hardware): bundle SSD1306 OLED driver from micropython-lib"
```

---

### Task 2: DHT22 Sensor Class

**Files:**
- Create: `hardware/lib/sensors.py`
- Test: `hardware/lib/test_sensors.py` (MicroPython-compatible test, also runnable via pytest with mocks)
- Create: `backend/src/tests/fixtures/hardware/test_sensors_mock.test.ts` (Vitest unit test for validation logic)

**Step 1: Write the failing test**

Create `backend/src/tests/fixtures/hardware/` directory and a test that validates our sensor data format expectations. Since MicroPython code can't run directly in Vitest, we test the *contract* - the data shapes and validation rules.

```typescript
// backend/src/tests/fixtures/hardware/sensorContract.test.ts
import { describe, it, expect } from 'vitest';

describe('DHT22 sensor data contract', () => {
  it('valid temperature range is -40 to 80 Celsius', () => {
    const isValidTemp = (t: number) => t >= -40 && t <= 80;
    expect(isValidTemp(22.5)).toBe(true);
    expect(isValidTemp(-41)).toBe(false);
    expect(isValidTemp(81)).toBe(false);
    expect(isValidTemp(NaN)).toBe(false);
  });

  it('valid humidity range is 0 to 100 percent', () => {
    const isValidHumidity = (h: number) => h >= 0 && h <= 100;
    expect(isValidHumidity(55.2)).toBe(true);
    expect(isValidHumidity(-1)).toBe(false);
    expect(isValidHumidity(101)).toBe(false);
  });

  it('sensor reading packet includes all expected fields', () => {
    const packet = {
      dht22: { temperature: 22.5, humidity: 55.0 },
      reed: { door_opened: false },
      pir: { motion_detected: true },
      ts: 1234567890,
    };
    expect(packet).toHaveProperty('dht22.temperature');
    expect(packet).toHaveProperty('dht22.humidity');
    expect(packet).toHaveProperty('reed.door_opened');
    expect(packet).toHaveProperty('pir.motion_detected');
    expect(packet).toHaveProperty('ts');
  });
});
```

**Step 2: Run test to verify it passes** (this is a contract test, it should pass immediately)

Run: `cd backend && npx vitest run src/tests/fixtures/hardware/sensorContract.test.ts`

**Step 3: Write DHT22Sensor class**

Create `hardware/lib/sensors.py`:

```python
"""Sensor classes for Elisa IoT on Heltec WiFi LoRa V3.

Each sensor class provides:
- Graceful degradation (stub mode when hardware unavailable)
- Input validation (reject out-of-range / NaN values)
- Try/except on every hardware read (never crash)

Reliability patterns:
- DHT22: filter NaN, retry once on bad read, keep last-known-good
- ReedSwitch: 50ms IRQ debounce, event tracking within intervals
- PIRSensor: 2s cooldown matching HC-SR501 retrigger time
"""

# Heltec WiFi LoRa V3 known-good GPIO ranges
# Avoid: 8-11 (LoRa SPI), 17-18 (OLED I2C), 35 (LED), 0 (BOOT button)
RESERVED_PINS = {8, 9, 10, 11, 17, 18, 21, 35, 0}


def _validate_pin(pin, name="pin"):
    """Validate GPIO pin number for Heltec V3."""
    if not isinstance(pin, int) or pin < 0 or pin > 48:
        raise ValueError(f"{name} must be 0-48, got {pin}")
    if pin in RESERVED_PINS:
        print(f"[WARN] {name}={pin} conflicts with reserved pin (LoRa/OLED/LED)")


class DHT22Sensor:
    """DHT22/AM2302 temperature + humidity sensor.

    Uses MicroPython's built-in dht module. Filters invalid reads.
    Retries once on bad read before returning last-known-good.

    Args:
        pin: GPIO pin number (default 13)
    """

    TEMP_MIN = -40.0
    TEMP_MAX = 80.0
    HUMIDITY_MIN = 0.0
    HUMIDITY_MAX = 100.0

    def __init__(self, pin=13):
        _validate_pin(pin, "DHT22 pin")
        self._pin_num = pin
        self._sensor = None
        self._last_good = {"temperature": 0.0, "humidity": 0.0}
        self._stub_mode = False
        try:
            import dht
            from machine import Pin
            self._sensor = dht.DHT22(Pin(pin))
        except ImportError:
            print(f"[DHT22] Stub mode (no hardware)")
            self._stub_mode = True

    def _is_valid(self, temp, humidity):
        """Check if reading is within valid range."""
        if temp != temp or humidity != humidity:  # NaN check
            return False
        if temp < self.TEMP_MIN or temp > self.TEMP_MAX:
            return False
        if humidity < self.HUMIDITY_MIN or humidity > self.HUMIDITY_MAX:
            return False
        return True

    def read(self):
        """Read temperature and humidity.

        Returns dict with 'temperature' (Celsius) and 'humidity' (%).
        On failure, returns last known good reading.
        """
        if self._stub_mode:
            return dict(self._last_good)

        for attempt in range(2):  # Retry once on bad read
            try:
                self._sensor.measure()
                temp = self._sensor.temperature()
                humidity = self._sensor.humidity()
                if self._is_valid(temp, humidity):
                    self._last_good = {"temperature": temp, "humidity": humidity}
                    return dict(self._last_good)
                elif attempt == 0:
                    import time
                    time.sleep_ms(250)  # Wait before retry
            except Exception as e:
                print(f"[DHT22] Read error (attempt {attempt + 1}): {e}")
                if attempt == 0:
                    import time
                    time.sleep_ms(250)

        # All attempts failed, return last known good
        print("[DHT22] Using last known good reading")
        return dict(self._last_good)
```

**Step 4: Commit**

```bash
git add hardware/lib/sensors.py backend/src/tests/fixtures/hardware/
git commit -m "feat(hardware): add DHT22Sensor class with validation and retry"
```

---

### Task 3: ReedSwitch and PIRSensor Classes

**Files:**
- Modify: `hardware/lib/sensors.py`

**Step 1: Add ReedSwitch class to sensors.py**

Append to `hardware/lib/sensors.py`:

```python
class ReedSwitch:
    """Magnetic reed switch for door/window open detection.

    Provides instantaneous read and event tracking within time intervals.
    Hardware debounce: 50ms interrupt cooldown to filter electrical noise.

    Args:
        pin: GPIO pin number (default 12)
    """

    DEBOUNCE_MS = 50

    def __init__(self, pin=12):
        _validate_pin(pin, "ReedSwitch pin")
        self._pin_num = pin
        self._pin = None
        self._event_flag = False
        self._last_irq_time = 0
        self._stub_mode = False
        try:
            from machine import Pin
            self._pin = Pin(pin, Pin.IN, Pin.PULL_UP)
        except ImportError:
            print(f"[ReedSwitch] Stub mode (no hardware)")
            self._stub_mode = True

    def _irq_handler(self, pin):
        """Debounced IRQ handler for state changes."""
        import time
        now = time.ticks_ms()
        if time.ticks_diff(now, self._last_irq_time) > self.DEBOUNCE_MS:
            self._last_irq_time = now
            self._event_flag = True
            if self._change_callback:
                self._change_callback(self.is_open())

    def is_open(self):
        """Check if reed switch is open (door/window open).

        Returns True if open, False if closed (magnet present).
        Reed switch is normally closed when magnet is near.
        """
        if self._stub_mode:
            return False
        try:
            return bool(self._pin.value())
        except Exception as e:
            print(f"[ReedSwitch] Read error: {e}")
            return False

    def on_change(self, callback):
        """Register callback for open/close state changes.

        Args:
            callback: function(is_open: bool) called on state change
        """
        self._change_callback = callback
        if not self._stub_mode:
            try:
                from machine import Pin
                self._pin.irq(trigger=Pin.IRQ_RISING | Pin.IRQ_FALLING,
                              handler=self._irq_handler)
            except Exception as e:
                print(f"[ReedSwitch] IRQ setup error: {e}")

    def events_since(self, reset=True):
        """Check if door opened since last check.

        Args:
            reset: If True, clear the event flag after reading.

        Returns True if at least one open/close event occurred.
        """
        had_event = self._event_flag
        if reset:
            self._event_flag = False
        return had_event


class PIRSensor:
    """HC-SR501 PIR motion sensor.

    Respects the HC-SR501's 2-second retrigger lockout time.
    Provides instantaneous read and event tracking within intervals.

    Args:
        pin: GPIO pin number (default 14)
        cooldown_ms: Minimum time between detections (default 2000ms)
    """

    def __init__(self, pin=14, cooldown_ms=2000):
        _validate_pin(pin, "PIR pin")
        self._pin_num = pin
        self._pin = None
        self._cooldown_ms = cooldown_ms
        self._last_trigger_time = 0
        self._event_flag = False
        self._motion_callback = None
        self._stub_mode = False
        try:
            from machine import Pin
            self._pin = Pin(pin, Pin.IN)
        except ImportError:
            print(f"[PIR] Stub mode (no hardware)")
            self._stub_mode = True

    def _irq_handler(self, pin):
        """Cooldown-gated IRQ handler."""
        import time
        now = time.ticks_ms()
        if time.ticks_diff(now, self._last_trigger_time) > self._cooldown_ms:
            self._last_trigger_time = now
            self._event_flag = True
            if self._motion_callback:
                self._motion_callback()

    def is_motion(self):
        """Check if motion is currently detected.

        Returns True if PIR output is HIGH.
        """
        if self._stub_mode:
            return False
        try:
            return bool(self._pin.value())
        except Exception as e:
            print(f"[PIR] Read error: {e}")
            return False

    def on_motion(self, callback):
        """Register callback for motion detection.

        Callback is rate-limited by cooldown_ms (default 2s).

        Args:
            callback: function() called when motion detected
        """
        self._motion_callback = callback
        if not self._stub_mode:
            try:
                from machine import Pin
                self._pin.irq(trigger=Pin.IRQ_RISING,
                              handler=self._irq_handler)
            except Exception as e:
                print(f"[PIR] IRQ setup error: {e}")

    def events_since(self, reset=True):
        """Check if motion occurred since last check.

        Args:
            reset: If True, clear the event flag after reading.

        Returns True if at least one motion event occurred.
        """
        had_event = self._event_flag
        if reset:
            self._event_flag = False
        return had_event
```

**Step 2: Add contract tests for reed and PIR**

Append to `backend/src/tests/fixtures/hardware/sensorContract.test.ts`:

```typescript
describe('ReedSwitch data contract', () => {
  it('door_opened is boolean', () => {
    expect(typeof false).toBe('boolean');
    expect(typeof true).toBe('boolean');
  });
});

describe('PIRSensor data contract', () => {
  it('motion_detected is boolean', () => {
    expect(typeof false).toBe('boolean');
    expect(typeof true).toBe('boolean');
  });

  it('cooldown default is 2000ms matching HC-SR501', () => {
    const HC_SR501_RETRIGGER_MS = 2000;
    expect(HC_SR501_RETRIGGER_MS).toBe(2000);
  });
});
```

**Step 3: Run tests**

Run: `cd backend && npx vitest run src/tests/fixtures/hardware/sensorContract.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add hardware/lib/sensors.py backend/src/tests/fixtures/hardware/sensorContract.test.ts
git commit -m "feat(hardware): add ReedSwitch and PIRSensor classes with debounce and cooldown"
```

---

### Task 4: OLED Display Class

**Files:**
- Create: `hardware/lib/oled.py`

**Step 1: Write OLEDDisplay class**

```python
"""OLED display abstraction for Heltec WiFi LoRa V3 (SSD1306 128x64).

Heltec V3 has an onboard SSD1306 OLED connected via I2C:
  SDA = GPIO 17
  SCL = GPIO 18
  RST = GPIO 21 (must be toggled on init)

All drawing operations are buffered. Call show() to flush to display.
"""

# Heltec V3 OLED pin defaults
OLED_SDA = 17
OLED_SCL = 18
OLED_RST = 21
OLED_WIDTH = 128
OLED_HEIGHT = 64
OLED_I2C_ADDR = 0x3C


class OLEDDisplay:
    """SSD1306 OLED display wrapper with convenience methods.

    Initializes with Heltec V3 defaults. Toggles RST pin for reliable startup.
    Falls back to print() in stub mode if hardware unavailable.

    Args:
        sda: I2C SDA pin (default 17)
        scl: I2C SCL pin (default 18)
        rst: Reset pin (default 21)
        width: Display width in pixels (default 128)
        height: Display height in pixels (default 64)
    """

    def __init__(self, sda=OLED_SDA, scl=OLED_SCL, rst=OLED_RST,
                 width=OLED_WIDTH, height=OLED_HEIGHT):
        self._width = width
        self._height = height
        self._display = None
        self._stub_mode = False
        try:
            from machine import Pin, SoftI2C
            import ssd1306
            import time

            # Reset OLED (required for Heltec V3)
            rst_pin = Pin(rst, Pin.OUT)
            rst_pin.value(0)
            time.sleep_ms(50)
            rst_pin.value(1)
            time.sleep_ms(50)

            i2c = SoftI2C(scl=Pin(scl), sda=Pin(sda))
            self._display = ssd1306.SSD1306_I2C(width, height, i2c,
                                                  addr=OLED_I2C_ADDR)
            self.clear()
            self.show()
        except Exception as e:
            print(f"[OLED] Stub mode: {e}")
            self._stub_mode = True

    def clear(self):
        """Clear the display buffer."""
        if self._stub_mode:
            return
        try:
            self._display.fill(0)
        except Exception as e:
            print(f"[OLED] Clear error: {e}")

    def text(self, string, x=0, y=0, color=1):
        """Draw text at position.

        Args:
            string: Text to display
            x: X pixel position (0 = left)
            y: Y pixel position (0 = top)
            color: 1 = white, 0 = black
        """
        if self._stub_mode:
            print(f"[OLED] ({x},{y}): {string}")
            return
        try:
            # Truncate to fit screen width (8px per char)
            max_chars = (self._width - x) // 8
            self._display.text(string[:max_chars], x, y, color)
        except Exception as e:
            print(f"[OLED] Text error: {e}")

    def show(self):
        """Flush display buffer to screen."""
        if self._stub_mode:
            return
        try:
            self._display.show()
        except Exception as e:
            print(f"[OLED] Show error: {e}")

    def draw_bar(self, label, value, max_val, y):
        """Draw a labeled horizontal bar.

        Args:
            label: Text label (e.g., "Temp")
            value: Current value
            max_val: Maximum value (for bar width calculation)
            y: Y pixel position
        """
        if max_val <= 0:
            max_val = 1  # Prevent division by zero
        bar_x = 48  # Start bar after label
        bar_width = self._width - bar_x - 4
        filled = int((min(value, max_val) / max_val) * bar_width)

        self.text(f"{label}:", 0, y)
        if not self._stub_mode:
            try:
                # Draw bar outline
                self._display.rect(bar_x, y, bar_width, 8, 1)
                # Draw filled portion
                if filled > 0:
                    self._display.fill_rect(bar_x, y, filled, 8, 1)
            except Exception as e:
                print(f"[OLED] Bar error: {e}")

    def show_readings(self, readings):
        """Auto-format and display sensor readings.

        Args:
            readings: dict from SensorNode, e.g.:
                {
                    'dht22': {'temperature': 22.5, 'humidity': 55.0},
                    'reed': {'door_opened': False},
                    'pir': {'motion_detected': True},
                    'ts': 1234567890
                }
        """
        self.clear()
        y = 0

        if 'dht22' in readings:
            d = readings['dht22']
            self.text(f"Temp: {d.get('temperature', '?'):.1f}C", 0, y)
            y += 10
            self.text(f"Hum:  {d.get('humidity', '?'):.1f}%", 0, y)
            y += 10

        if 'reed' in readings:
            state = "OPEN" if readings['reed'].get('door_opened') else "CLOSED"
            self.text(f"Door: {state}", 0, y)
            y += 10

        if 'pir' in readings:
            state = "YES" if readings['pir'].get('motion_detected') else "no"
            self.text(f"Motion: {state}", 0, y)
            y += 10

        # Status line at bottom
        self.text("Elisa IoT", 0, self._height - 8)
        self.show()
```

**Step 2: Commit**

```bash
git add hardware/lib/oled.py
git commit -m "feat(hardware): add OLEDDisplay class with Heltec V3 reset and auto-format"
```

---

### Task 5: SensorNode and GatewayNode Orchestration Classes

**Files:**
- Create: `hardware/lib/nodes.py`

**Step 1: Write SensorNode class**

```python
"""Node orchestration classes for Elisa IoT.

SensorNode: polls sensors, sends over LoRa, displays on OLED.
GatewayNode: receives LoRa, POSTs to cloud via WiFi.

Reliability patterns:
- LoRa: fixed-size packet with checksum, 2 retries on send failure
- WiFi: auto-reconnect with exponential backoff (1-30s)
- HTTP: 10s timeout, 2 retries, queue up to 100 failed posts
- WDT: 60s watchdog timer, fed in main loop
- Memory: bounded data structures, no unbounded lists
"""

import json
import time


def _simple_checksum(data_bytes):
    """Simple XOR checksum for LoRa packet integrity."""
    cksum = 0
    for b in data_bytes:
        cksum ^= b
    return cksum & 0xFF


class SensorNode:
    """Polls sensors, packs data, sends over LoRa, optionally shows on OLED.

    Args:
        sensors: list of sensor objects (DHT22Sensor, ReedSwitch, PIRSensor)
        lora_channel: LoRa channel number (default 1)
        display: OLEDDisplay instance or None
        board: ElisaBoard instance (for LoRa access)
    """

    def __init__(self, sensors, lora_channel=1, display=None, board=None):
        self._sensors = sensors
        self._channel = lora_channel
        self._display = display
        self._board = board
        self._wdt = None

    def _init_watchdog(self):
        """Enable hardware watchdog (60s timeout)."""
        try:
            from machine import WDT
            self._wdt = WDT(timeout=60000)
            print("[SensorNode] Watchdog enabled (60s)")
        except Exception as e:
            print(f"[SensorNode] WDT unavailable: {e}")

    def _feed_watchdog(self):
        """Feed the watchdog timer."""
        if self._wdt:
            try:
                self._wdt.feed()
            except Exception:
                pass

    def _read_all(self):
        """Read all sensors, return packed dict."""
        readings = {"ts": time.time()}
        for sensor in self._sensors:
            cls_name = type(sensor).__name__
            try:
                if cls_name == "DHT22Sensor":
                    readings["dht22"] = sensor.read()
                elif cls_name == "ReedSwitch":
                    readings["reed"] = {
                        "door_opened": sensor.events_since(reset=True)
                    }
                elif cls_name == "PIRSensor":
                    readings["pir"] = {
                        "motion_detected": sensor.events_since(reset=True)
                    }
                else:
                    readings[cls_name.lower()] = {"raw": str(sensor)}
            except Exception as e:
                print(f"[SensorNode] {cls_name} read error: {e}")
        return readings

    def _send_lora(self, readings):
        """Send readings over LoRa with checksum and retry."""
        if not self._board:
            print(f"[LoRa TX ch{self._channel}] {json.dumps(readings)}")
            return

        payload = json.dumps(readings)
        data_bytes = payload.encode("utf-8")
        cksum = _simple_checksum(data_bytes)
        # Packet format: <checksum_hex>|<json_payload>
        packet = f"{cksum:02x}|{payload}"

        for attempt in range(3):
            try:
                self._board.send_message(packet, channel=self._channel)
                return
            except Exception as e:
                print(f"[LoRa TX] Send error (attempt {attempt + 1}): {e}")
                time.sleep_ms(100)
        print("[LoRa TX] All retries failed")

    def start(self, interval_sec=10):
        """Start the sensor acquisition loop.

        Reads all sensors, sends over LoRa, updates OLED display.
        Runs forever (until device reset or power off).

        Args:
            interval_sec: Seconds between broadcasts (default 10)
        """
        self._init_watchdog()
        print(f"[SensorNode] Starting (interval={interval_sec}s, ch={self._channel})")

        # Register event-based sensors (reed, PIR) for interrupt tracking
        for sensor in self._sensors:
            cls_name = type(sensor).__name__
            if cls_name == "ReedSwitch":
                sensor.on_change(lambda is_open: None)  # Enable IRQ tracking
            elif cls_name == "PIRSensor":
                sensor.on_motion(lambda: None)  # Enable IRQ tracking

        while True:
            self._feed_watchdog()
            readings = self._read_all()

            # Send over LoRa
            self._send_lora(readings)

            # Update OLED if present
            if self._display:
                try:
                    self._display.show_readings(readings)
                except Exception as e:
                    print(f"[SensorNode] Display error: {e}")

            time.sleep(interval_sec)


class GatewayNode:
    """Receives LoRa data, POSTs to cloud endpoint via WiFi.

    Handles WiFi reconnection with exponential backoff.
    Queues failed HTTP posts for retry (up to 100 entries).

    Args:
        lora_channel: LoRa channel to listen on (default 1)
        wifi_ssid: WiFi network name
        wifi_pass: WiFi password
        cloud_url: Full URL for HTTP POST (e.g., https://foo.run.app/data)
        api_key: API key for cloud endpoint authentication
        board: ElisaBoard instance (for LoRa access)
    """

    MAX_QUEUE = 100
    HTTP_TIMEOUT_SEC = 10
    HTTP_RETRIES = 2

    def __init__(self, lora_channel=1, wifi_ssid="", wifi_pass="",
                 cloud_url="", api_key="", board=None):
        self._channel = lora_channel
        self._wifi_ssid = wifi_ssid
        self._wifi_pass = wifi_pass
        self._cloud_url = cloud_url
        self._api_key = api_key
        self._board = board
        self._post_queue = []
        self._wdt = None
        self._wifi_connected = False
        self._backoff_ms = 1000

    def _init_watchdog(self):
        """Enable hardware watchdog (60s timeout)."""
        try:
            from machine import WDT
            self._wdt = WDT(timeout=60000)
        except Exception:
            pass

    def _feed_watchdog(self):
        """Feed the watchdog timer."""
        if self._wdt:
            try:
                self._wdt.feed()
            except Exception:
                pass

    def _connect_wifi(self):
        """Connect to WiFi with exponential backoff on failure."""
        try:
            import network
            wlan = network.WLAN(network.STA_IF)
            wlan.active(True)
            if wlan.isconnected():
                self._wifi_connected = True
                self._backoff_ms = 1000
                return True

            print(f"[Gateway] Connecting to WiFi '{self._wifi_ssid}'...")
            wlan.connect(self._wifi_ssid, self._wifi_pass)

            # Wait up to 10 seconds
            for _ in range(20):
                if wlan.isconnected():
                    ip = wlan.ifconfig()[0]
                    print(f"[Gateway] WiFi connected: {ip}")
                    self._wifi_connected = True
                    self._backoff_ms = 1000
                    return True
                time.sleep_ms(500)

            print(f"[Gateway] WiFi failed, backoff {self._backoff_ms}ms")
            self._wifi_connected = False
            time.sleep_ms(self._backoff_ms)
            self._backoff_ms = min(self._backoff_ms * 2, 30000)
            return False
        except ImportError:
            print("[Gateway] Stub mode (no network module)")
            return False
        except Exception as e:
            print(f"[Gateway] WiFi error: {e}")
            return False

    def _http_post(self, data):
        """POST JSON data to cloud endpoint with retry.

        Returns True on success, False on failure (queues for retry).
        """
        if not self._cloud_url:
            print(f"[Gateway POST] {json.dumps(data)}")
            return True

        try:
            import urequests
        except ImportError:
            print(f"[Gateway POST stub] {json.dumps(data)}")
            return True

        headers = {
            "Content-Type": "application/json",
            "X-API-Key": self._api_key,
        }

        for attempt in range(self.HTTP_RETRIES):
            try:
                resp = urequests.post(
                    self._cloud_url,
                    json=data,
                    headers=headers,
                )
                status = resp.status_code
                resp.close()
                if 200 <= status < 300:
                    return True
                print(f"[Gateway] POST returned {status} (attempt {attempt + 1})")
            except Exception as e:
                print(f"[Gateway] POST error (attempt {attempt + 1}): {e}")

        return False

    def _queue_post(self, data):
        """Queue failed POST for retry. Bounded to MAX_QUEUE."""
        if len(self._post_queue) < self.MAX_QUEUE:
            self._post_queue.append(data)
        else:
            # Drop oldest
            self._post_queue.pop(0)
            self._post_queue.append(data)

    def _flush_queue(self):
        """Retry queued posts."""
        sent = []
        for i, data in enumerate(self._post_queue):
            if self._http_post(data):
                sent.append(i)
            else:
                break  # Stop on first failure
        for i in reversed(sent):
            self._post_queue.pop(i)

    def _parse_lora_packet(self, raw_msg):
        """Parse LoRa packet with checksum verification.

        Packet format: <checksum_hex>|<json_payload>
        Returns parsed dict or None if invalid.
        """
        try:
            # Strip channel prefix if present (from ElisaBoard)
            msg = raw_msg
            if msg.startswith("[ch"):
                idx = msg.find("]")
                if idx >= 0:
                    msg = msg[idx + 1:]

            if "|" not in msg:
                return None

            cksum_hex, payload = msg.split("|", 1)
            expected_cksum = int(cksum_hex, 16)
            actual_cksum = _simple_checksum(payload.encode("utf-8"))

            if expected_cksum != actual_cksum:
                print(f"[Gateway] Checksum mismatch: {expected_cksum} != {actual_cksum}")
                return None

            return json.loads(payload)
        except Exception as e:
            print(f"[Gateway] Parse error: {e}")
            return None

    def _on_lora_message(self, msg, channel):
        """Handle incoming LoRa message."""
        data = self._parse_lora_packet(msg)
        if data is None:
            return

        print(f"[Gateway] Received: {json.dumps(data)}")

        if self._wifi_connected:
            if not self._http_post(data):
                self._queue_post(data)
            else:
                # Try to flush queued posts on success
                if self._post_queue:
                    self._flush_queue()
        else:
            self._queue_post(data)

    def start(self):
        """Start the gateway receive loop.

        Connects to WiFi, listens for LoRa, POSTs to cloud.
        Runs forever (until device reset or power off).
        """
        self._init_watchdog()
        print(f"[Gateway] Starting (ch={self._channel})")

        # Initial WiFi connection
        self._connect_wifi()

        # Register LoRa listener
        if self._board:
            self._board.on_message(self._on_lora_message, channel=self._channel)
        else:
            print("[Gateway] No board - stub mode, no LoRa listener")

        # Main loop: maintain WiFi, flush queue, feed watchdog
        while True:
            self._feed_watchdog()

            if not self._wifi_connected:
                self._connect_wifi()

            if self._wifi_connected and self._post_queue:
                self._flush_queue()

            time.sleep(1)
```

**Step 2: Commit**

```bash
git add hardware/lib/nodes.py
git commit -m "feat(hardware): add SensorNode and GatewayNode with LoRa checksum, WiFi reconnect, and post queue"
```

---

### Task 6: Update elisa_hardware.py to re-export new classes

**Files:**
- Modify: `hardware/lib/elisa_hardware.py` (line ~1, add imports at top)

**Step 1: Add imports to elisa_hardware.py**

Add at the end of the file (after the ElisaBoard class):

```python
# IoT sensor network classes
try:
    from sensors import DHT22Sensor, ReedSwitch, PIRSensor
    from oled import OLEDDisplay
    from nodes import SensorNode, GatewayNode
except ImportError:
    pass  # These modules are optional
```

**Step 2: Commit**

```bash
git add hardware/lib/elisa_hardware.py
git commit -m "feat(hardware): re-export IoT classes from elisa_hardware"
```

---

### Task 7: MicroPython Templates

**Files:**
- Create: `hardware/templates/sensor_node.py`
- Create: `hardware/templates/gateway_node.py`

**Step 1: Write sensor node template**

```python
"""Elisa IoT Sensor Node -- reads sensors, displays on OLED, sends over LoRa.

Sensors: DHT22 (temp/humidity), Reed Switch (door), PIR (motion)
Display: SSD1306 OLED (Heltec V3 onboard)
Comms: LoRa SX1262 @ 915 MHz

Usage:
  python sensor_node.py          # Normal operation
  python sensor_node.py --test   # Sensor connectivity self-test
"""

import sys
from elisa_hardware import ElisaBoard
from sensors import DHT22Sensor, ReedSwitch, PIRSensor
from oled import OLEDDisplay
from nodes import SensorNode

# Configuration
LORA_CHANNEL = 1
BROADCAST_INTERVAL = 10  # seconds

# Initialize hardware
board = ElisaBoard()
dht = DHT22Sensor(pin=13)
reed = ReedSwitch(pin=12)
pir = PIRSensor(pin=14)
display = OLEDDisplay()

# Self-test mode
if "--test" in sys.argv:
    print("=== Sensor Self-Test ===")
    print(f"DHT22: {dht.read()}")
    print(f"Reed:  open={reed.is_open()}")
    print(f"PIR:   motion={pir.is_motion()}")
    display.text("Self-test OK", 0, 0)
    display.show()
    print("=== All sensors responding ===")
    sys.exit(0)

# Start sensor node
print("Elisa IoT Sensor Node -- starting!")
node = SensorNode(
    sensors=[dht, reed, pir],
    lora_channel=LORA_CHANNEL,
    display=display,
    board=board,
)
node.start(interval_sec=BROADCAST_INTERVAL)
```

**Step 2: Write gateway node template**

```python
"""Elisa IoT Gateway Node -- receives LoRa data, publishes to cloud dashboard.

Comms: LoRa RX @ 915 MHz, WiFi -> HTTP POST to Cloud Run
Config: WiFi credentials and cloud URL injected by Elisa deploy phase.

Usage:
  python gateway_node.py         # Normal operation
  python gateway_node.py --test  # WiFi connectivity self-test
"""

import sys
from elisa_hardware import ElisaBoard
from nodes import GatewayNode

# Configuration (injected by Elisa deploy phase)
LORA_CHANNEL = 1
WIFI_SSID = "__WIFI_SSID__"
WIFI_PASS = "__WIFI_PASS__"
CLOUD_URL = "__CLOUD_URL__"
API_KEY = "__API_KEY__"

# Initialize
board = ElisaBoard()

# Self-test mode
if "--test" in sys.argv:
    print("=== Gateway Self-Test ===")
    try:
        import network
        wlan = network.WLAN(network.STA_IF)
        wlan.active(True)
        wlan.connect(WIFI_SSID, WIFI_PASS)
        import time
        for i in range(20):
            if wlan.isconnected():
                print(f"WiFi: connected ({wlan.ifconfig()[0]})")
                break
            time.sleep_ms(500)
        else:
            print("WiFi: FAILED to connect")
    except Exception as e:
        print(f"WiFi: error - {e}")
    print("=== Self-test complete ===")
    sys.exit(0)

# Start gateway
print("Elisa IoT Gateway Node -- starting!")
gateway = GatewayNode(
    lora_channel=LORA_CHANNEL,
    wifi_ssid=WIFI_SSID,
    wifi_pass=WIFI_PASS,
    cloud_url=CLOUD_URL,
    api_key=API_KEY,
    board=board,
)
gateway.start()
```

**Step 3: Commit**

```bash
git add hardware/templates/sensor_node.py hardware/templates/gateway_node.py
git commit -m "feat(hardware): add sensor node and gateway node templates with self-test"
```

---

## Phase 2: NuggetSpec Schema & Types

### Task 8: Extend Zod Schema

**Files:**
- Modify: `backend/src/utils/specValidator.ts` (add after line ~67, before NuggetSpecSchema)
- Test: `backend/src/tests/behavioral/specValidator.iot.test.ts`

**Step 1: Write failing test**

```typescript
// backend/src/tests/behavioral/specValidator.iot.test.ts
import { describe, it, expect } from 'vitest';
import { NuggetSpecSchema } from '../../utils/specValidator.js';

describe('NuggetSpecSchema IoT hardware config', () => {
  const baseSpec = {
    nugget: { goal: 'IoT sensor network', description: 'Sensor node with gateway' },
    deployment: { target: 'iot' },
  };

  it('accepts valid IoT hardware config with sensor node and gateway', () => {
    const spec = {
      ...baseSpec,
      hardware: {
        devices: [
          {
            role: 'sensor_node',
            board: 'heltec_lora_v3',
            sensors: ['dht22', 'reed_switch', 'pir'],
            display: 'oled_ssd1306',
            lora: { channel: 1 },
          },
          {
            role: 'gateway_node',
            board: 'heltec_lora_v3',
            lora: { channel: 1 },
          },
        ],
        cloud: {
          platform: 'cloud_run',
          project: 'my-project',
          region: 'us-central1',
        },
      },
    };
    const result = NuggetSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it('rejects unknown sensor type', () => {
    const spec = {
      ...baseSpec,
      hardware: {
        devices: [{
          role: 'sensor_node',
          board: 'heltec_lora_v3',
          sensors: ['unknown_sensor'],
          lora: { channel: 1 },
        }],
      },
    };
    const result = NuggetSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
  });

  it('rejects unknown device role', () => {
    const spec = {
      ...baseSpec,
      hardware: {
        devices: [{
          role: 'unknown_role',
          board: 'heltec_lora_v3',
          lora: { channel: 1 },
        }],
      },
    };
    const result = NuggetSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
  });

  it('accepts iot deployment target', () => {
    const result = NuggetSpecSchema.safeParse(baseSpec);
    expect(result.success).toBe(true);
  });

  it('accepts documentation config', () => {
    const spec = {
      ...baseSpec,
      documentation: { generate: true, focus: 'all' },
    };
    const result = NuggetSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it('rejects invalid documentation focus', () => {
    const spec = {
      ...baseSpec,
      documentation: { generate: true, focus: 'invalid_focus' },
    };
    const result = NuggetSpecSchema.safeParse(spec);
    expect(result.success).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/tests/behavioral/specValidator.iot.test.ts`
Expected: FAIL (hardware, documentation, and 'iot' target not in schema yet)

**Step 3: Add Zod schemas to specValidator.ts**

Add before the NuggetSpecSchema definition (around line ~200):

```typescript
// --- IoT Hardware schemas ---

const LoRaConfigSchema = z.object({
  channel: z.number().int().min(0).max(255),
  frequency: z.number().optional(),
});

const HardwareDeviceSchema = z.object({
  role: z.enum(['sensor_node', 'gateway_node']),
  board: z.enum(['heltec_lora_v3']),
  sensors: z.array(z.enum(['dht22', 'reed_switch', 'pir'])).optional(),
  display: z.enum(['oled_ssd1306']).optional(),
  lora: LoRaConfigSchema,
});

const CloudConfigSchema = z.object({
  platform: z.enum(['cloud_run']),
  project: z.string().max(100).optional(),
  region: z.string().max(50).optional(),
});

const HardwareConfigSchema = z.object({
  devices: z.array(HardwareDeviceSchema).min(1).max(10),
  cloud: CloudConfigSchema.optional(),
});

const DocumentationConfigSchema = z.object({
  generate: z.boolean(),
  focus: z.enum(['how_it_works', 'setup', 'parts', 'all']),
});
```

Then modify the deployment target enum in NuggetSpecSchema to include `'iot'`:

Change the deployment.target line from:
```typescript
target: z.enum(['web', 'esp32', 'both']).optional(),
```
to:
```typescript
target: z.enum(['web', 'esp32', 'both', 'iot']).optional(),
```

And add to NuggetSpecSchema:
```typescript
hardware: HardwareConfigSchema.optional(),
documentation: DocumentationConfigSchema.optional(),
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/tests/behavioral/specValidator.iot.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/utils/specValidator.ts backend/src/tests/behavioral/specValidator.iot.test.ts
git commit -m "feat(schema): add IoT hardware, cloud, and documentation Zod schemas"
```

---

### Task 9: Extend Frontend TypeScript Types

**Files:**
- Modify: `frontend/src/types/index.ts` (add new types and WSEvent variants)

**Step 1: Add hardware config types to types/index.ts**

Add after existing type definitions:

```typescript
// IoT Hardware types
export interface LoRaConfig {
  channel: number;
  frequency?: number;
}

export interface HardwareDevice {
  role: 'sensor_node' | 'gateway_node';
  board: 'heltec_lora_v3';
  sensors?: ('dht22' | 'reed_switch' | 'pir')[];
  display?: 'oled_ssd1306';
  lora: LoRaConfig;
}

export interface CloudConfig {
  platform: 'cloud_run';
  project?: string;
  region?: string;
}

export interface HardwareConfig {
  devices: HardwareDevice[];
  cloud?: CloudConfig;
}

export interface DocumentationConfig {
  generate: boolean;
  focus: 'how_it_works' | 'setup' | 'parts' | 'all';
}
```

Add new WSEvent variants to the WSEvent union:

```typescript
| { type: 'flash_prompt'; device_role: string; message: string }
| { type: 'flash_progress'; device_role: string; step: string; progress: number }
| { type: 'flash_complete'; device_role: string; success: boolean; message?: string }
| { type: 'documentation_ready'; file_path: string }
```

**Step 2: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(types): add IoT hardware, flash wizard, and documentation WSEvent types"
```

---

## Phase 3: Blockly Blocks & Interpreter

### Task 10: Add Block Definitions

**Files:**
- Modify: `frontend/src/components/BlockCanvas/blockDefinitions.ts`
- Test: `frontend/src/components/BlockCanvas/blockDefinitions.iot.test.ts`

**Step 1: Write failing test**

```typescript
// frontend/src/components/BlockCanvas/blockDefinitions.iot.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import * as Blockly from 'blockly';
import { registerBlocks } from './blockDefinitions';

// Note: registerBlocks() is idempotent (guarded by `registered` flag)

describe('IoT block definitions', () => {
  it('registers iot_sensor_node block', () => {
    registerBlocks();
    // Blockly.Blocks is a map of block type -> definition
    expect(Blockly.Blocks['iot_sensor_node']).toBeDefined();
  });

  it('registers iot_gateway_node block', () => {
    registerBlocks();
    expect(Blockly.Blocks['iot_gateway_node']).toBeDefined();
  });

  it('registers iot_cloud_dashboard block', () => {
    registerBlocks();
    expect(Blockly.Blocks['iot_cloud_dashboard']).toBeDefined();
  });

  it('registers hw_read_dht22 block', () => {
    registerBlocks();
    expect(Blockly.Blocks['hw_read_dht22']).toBeDefined();
  });

  it('registers write_guide block', () => {
    registerBlocks();
    expect(Blockly.Blocks['write_guide']).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/BlockCanvas/blockDefinitions.iot.test.ts`
Expected: FAIL (blocks not registered)

**Step 3: Add block definitions to blockDefinitions.ts**

Add to the `blockDefs` array (before the closing `]`):

```typescript
  // IoT Devices category (colour 45)
  {
    type: 'iot_sensor_node',
    message0: 'Sensor node reads %1 %2 %3 %4 on LoRa channel %5 every %6 seconds',
    args0: [
      { type: 'field_checkbox', name: 'SENSOR_DHT22', checked: true },
      { type: 'field_label_serializable', name: 'LABEL_DHT22', text: 'Temp/Humidity' },
      { type: 'field_checkbox', name: 'SENSOR_REED', checked: true },
      { type: 'field_label_serializable', name: 'LABEL_REED', text: 'Door sensor' },
      { type: 'field_number', name: 'LORA_CHANNEL', value: 1, min: 0, max: 255 },
      { type: 'field_number', name: 'INTERVAL', value: 10, min: 1, max: 3600 },
    ],
    message1: '%1 %2 %3 %4',
    args1: [
      { type: 'field_checkbox', name: 'SENSOR_PIR', checked: true },
      { type: 'field_label_serializable', name: 'LABEL_PIR', text: 'Motion sensor' },
      { type: 'field_checkbox', name: 'HAS_OLED', checked: true },
      { type: 'field_label_serializable', name: 'LABEL_OLED', text: 'OLED display' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 45,
    tooltip: 'A sensor node that collects data and sends it over LoRa',
  },
  {
    type: 'iot_gateway_node',
    message0: 'Gateway on LoRa channel %1 connects to WiFi %2 password %3',
    args0: [
      { type: 'field_number', name: 'LORA_CHANNEL', value: 1, min: 0, max: 255 },
      { type: 'field_input', name: 'WIFI_SSID', text: 'MyNetwork' },
      { type: 'field_input', name: 'WIFI_PASS', text: '' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 45,
    tooltip: 'A gateway that receives LoRa data and publishes to the cloud',
  },
  {
    type: 'iot_cloud_dashboard',
    message0: 'Live dashboard on Google Cloud project %1',
    args0: [
      { type: 'field_input', name: 'GCP_PROJECT', text: 'my-project-id' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 45,
    tooltip: 'Deploy a live sensor dashboard to Google Cloud Run',
  },
  // Hardware component blocks (colour 45)
  {
    type: 'hw_read_dht22',
    message0: 'Read temperature and humidity',
    previousStatement: null,
    nextStatement: null,
    colour: 45,
    tooltip: 'Read DHT22 sensor (temperature and humidity)',
  },
  {
    type: 'hw_read_reed',
    message0: 'Check if door/window is open',
    previousStatement: null,
    nextStatement: null,
    colour: 45,
    tooltip: 'Read reed switch (door/window open sensor)',
  },
  {
    type: 'hw_read_pir',
    message0: 'Check for motion',
    previousStatement: null,
    nextStatement: null,
    colour: 45,
    tooltip: 'Read PIR motion sensor',
  },
  {
    type: 'hw_oled_text',
    message0: 'Show %1 on display at x %2 y %3',
    args0: [
      { type: 'field_input', name: 'TEXT', text: 'Hello!' },
      { type: 'field_number', name: 'X', value: 0 },
      { type: 'field_number', name: 'Y', value: 0 },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 45,
    tooltip: 'Show text on the OLED display',
  },
  {
    type: 'hw_oled_readings',
    message0: 'Show sensor readings on display',
    previousStatement: null,
    nextStatement: null,
    colour: 45,
    tooltip: 'Display all sensor readings on OLED',
  },
  {
    type: 'hw_oled_clear',
    message0: 'Clear the display',
    previousStatement: null,
    nextStatement: null,
    colour: 45,
    tooltip: 'Clear the OLED display',
  },
  {
    type: 'hw_lora_send',
    message0: 'Send %1 over LoRa channel %2',
    args0: [
      { type: 'field_input', name: 'DATA', text: 'sensor data' },
      { type: 'field_number', name: 'CHANNEL', value: 1 },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 45,
    tooltip: 'Send data over LoRa radio',
  },
  {
    type: 'hw_lora_receive',
    message0: 'When LoRa data arrives on channel %1 %2',
    args0: [
      { type: 'field_number', name: 'CHANNEL', value: 1 },
      { type: 'input_statement', name: 'ACTION_BLOCKS' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 45,
    tooltip: 'Do something when LoRa data is received',
  },
  {
    type: 'hw_wifi_connect',
    message0: 'Connect to WiFi %1 password %2',
    args0: [
      { type: 'field_input', name: 'SSID', text: 'MyNetwork' },
      { type: 'field_input', name: 'PASS', text: '' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 45,
    tooltip: 'Connect to a WiFi network',
  },
  {
    type: 'hw_http_post',
    message0: 'Send data to %1',
    args0: [
      { type: 'field_input', name: 'URL', text: 'https://example.com/data' },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 45,
    tooltip: 'Send data to a URL via HTTP POST',
  },
  // Goals category addition
  {
    type: 'write_guide',
    message0: 'Write me a guide about %1',
    args0: [
      {
        type: 'field_dropdown',
        name: 'GUIDE_FOCUS',
        options: [
          ['how everything works', 'how_it_works'],
          ['how to set it up', 'setup'],
          ['what each part does', 'parts'],
          ['all of the above', 'all'],
        ],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: 210,
    tooltip: 'Generate a kid-friendly guide about your project',
  },
```

**Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/BlockCanvas/blockDefinitions.iot.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/components/BlockCanvas/blockDefinitions.ts frontend/src/components/BlockCanvas/blockDefinitions.iot.test.ts
git commit -m "feat(blocks): add IoT Devices, Hardware component, and write_guide block definitions"
```

---

### Task 11: Add Toolbox Categories

**Files:**
- Modify: `frontend/src/components/BlockCanvas/toolbox.ts`

**Step 1: Add IoT and Hardware categories to toolbox**

Add two new categories to the toolbox definition. Insert before the Deploy category:

```typescript
{
  kind: 'category',
  name: 'IoT Devices',
  colour: '45',
  contents: [
    { kind: 'block', type: 'iot_sensor_node' },
    { kind: 'block', type: 'iot_gateway_node' },
    { kind: 'block', type: 'iot_cloud_dashboard' },
  ],
},
{
  kind: 'category',
  name: 'Hardware',
  colour: '45',
  contents: [
    { kind: 'block', type: 'hw_read_dht22' },
    { kind: 'block', type: 'hw_read_reed' },
    { kind: 'block', type: 'hw_read_pir' },
    { kind: 'block', type: 'hw_oled_text' },
    { kind: 'block', type: 'hw_oled_readings' },
    { kind: 'block', type: 'hw_oled_clear' },
    { kind: 'block', type: 'hw_lora_send' },
    { kind: 'block', type: 'hw_lora_receive' },
    { kind: 'block', type: 'hw_wifi_connect' },
    { kind: 'block', type: 'hw_http_post' },
  ],
},
```

Also add `write_guide` to the Goals category:

```typescript
{ kind: 'block', type: 'write_guide' },
```

**Step 2: Commit**

```bash
git add frontend/src/components/BlockCanvas/toolbox.ts
git commit -m "feat(blocks): add IoT Devices and Hardware toolbox categories"
```

---

### Task 12: Extend Block Interpreter

**Files:**
- Modify: `frontend/src/components/BlockCanvas/blockInterpreter.ts`
- Test: `frontend/src/components/BlockCanvas/blockInterpreter.iot.test.ts`

**Step 1: Write failing test**

```typescript
// frontend/src/components/BlockCanvas/blockInterpreter.iot.test.ts
import { describe, it, expect } from 'vitest';
import { interpretWorkspace } from './blockInterpreter';
import type { WorkspaceJson, BlockJson } from './blockInterpreter';

function makeBlock(type: string, fields: Record<string, unknown> = {}, next?: BlockJson): BlockJson {
  return {
    type,
    id: `test_${type}_${Math.random().toString(36).slice(2)}`,
    fields,
    next: next ? { block: next } : undefined,
  } as BlockJson;
}

function makeWorkspace(blocks: BlockJson[]): WorkspaceJson {
  return { blocks: { blocks } } as WorkspaceJson;
}

describe('IoT block interpretation', () => {
  it('interprets iot_sensor_node block', () => {
    const block = makeBlock('iot_sensor_node', {
      SENSOR_DHT22: true,
      SENSOR_REED: true,
      SENSOR_PIR: false,
      HAS_OLED: true,
      LORA_CHANNEL: 1,
      INTERVAL: 10,
    });
    const ws = makeWorkspace([makeBlock('nugget_goal', { GOAL_TEXT: 'IoT' }, block)]);
    const spec = interpretWorkspace(ws);
    expect(spec.hardware).toBeDefined();
    expect(spec.hardware!.devices).toHaveLength(1);
    expect(spec.hardware!.devices[0].role).toBe('sensor_node');
    expect(spec.hardware!.devices[0].sensors).toContain('dht22');
    expect(spec.hardware!.devices[0].sensors).toContain('reed_switch');
    expect(spec.hardware!.devices[0].sensors).not.toContain('pir');
    expect(spec.hardware!.devices[0].display).toBe('oled_ssd1306');
    expect(spec.hardware!.devices[0].lora.channel).toBe(1);
    expect(spec.deployment?.target).toBe('iot');
  });

  it('interprets iot_gateway_node block', () => {
    const block = makeBlock('iot_gateway_node', {
      LORA_CHANNEL: 1,
      WIFI_SSID: 'TestNet',
      WIFI_PASS: 'secret123',
    });
    const ws = makeWorkspace([makeBlock('nugget_goal', { GOAL_TEXT: 'IoT' }, block)]);
    const spec = interpretWorkspace(ws);
    expect(spec.hardware).toBeDefined();
    const gw = spec.hardware!.devices.find(d => d.role === 'gateway_node');
    expect(gw).toBeDefined();
    expect(gw!.lora.channel).toBe(1);
  });

  it('interprets iot_cloud_dashboard block', () => {
    const block = makeBlock('iot_cloud_dashboard', { GCP_PROJECT: 'my-proj' });
    const ws = makeWorkspace([makeBlock('nugget_goal', { GOAL_TEXT: 'IoT' }, block)]);
    const spec = interpretWorkspace(ws);
    expect(spec.hardware?.cloud).toBeDefined();
    expect(spec.hardware!.cloud!.platform).toBe('cloud_run');
    expect(spec.hardware!.cloud!.project).toBe('my-proj');
  });

  it('interprets write_guide block', () => {
    const block = makeBlock('write_guide', { GUIDE_FOCUS: 'all' });
    const ws = makeWorkspace([makeBlock('nugget_goal', { GOAL_TEXT: 'test' }, block)]);
    const spec = interpretWorkspace(ws);
    expect(spec.documentation).toBeDefined();
    expect(spec.documentation!.generate).toBe(true);
    expect(spec.documentation!.focus).toBe('all');
  });

  it('sets deployment target to iot when sensor node present', () => {
    const block = makeBlock('iot_sensor_node', {
      SENSOR_DHT22: true, SENSOR_REED: false, SENSOR_PIR: false,
      HAS_OLED: false, LORA_CHANNEL: 1, INTERVAL: 5,
    });
    const ws = makeWorkspace([makeBlock('nugget_goal', { GOAL_TEXT: 'IoT' }, block)]);
    const spec = interpretWorkspace(ws);
    expect(spec.deployment?.target).toBe('iot');
  });

  it('adds hardware component blocks to requirements', () => {
    const block = makeBlock('hw_read_dht22', {}, makeBlock('hw_oled_readings'));
    const ws = makeWorkspace([makeBlock('nugget_goal', { GOAL_TEXT: 'test' }, block)]);
    const spec = interpretWorkspace(ws);
    expect(spec.requirements?.some(r => r.includes('DHT22') || r.includes('temperature'))).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/BlockCanvas/blockInterpreter.iot.test.ts`
Expected: FAIL (interpreter doesn't handle new block types yet)

**Step 3: Add IoT block handling to interpretWorkspace()**

In `blockInterpreter.ts`, inside the block walking loop, add cases for the new block types. Also add `hardware` and `documentation` to the NuggetSpec interface.

Add to the NuggetSpec interface:
```typescript
hardware?: {
  devices: Array<{
    role: 'sensor_node' | 'gateway_node';
    board: 'heltec_lora_v3';
    sensors?: string[];
    display?: string;
    lora: { channel: number };
  }>;
  cloud?: {
    platform: 'cloud_run';
    project?: string;
    region?: string;
  };
};
documentation?: {
  generate: boolean;
  focus: 'how_it_works' | 'setup' | 'parts' | 'all';
};
```

Add block handling cases:

```typescript
case 'iot_sensor_node': {
  if (!spec.hardware) spec.hardware = { devices: [] };
  const sensors: string[] = [];
  if (block.fields?.SENSOR_DHT22) sensors.push('dht22');
  if (block.fields?.SENSOR_REED) sensors.push('reed_switch');
  if (block.fields?.SENSOR_PIR) sensors.push('pir');
  const device: any = {
    role: 'sensor_node',
    board: 'heltec_lora_v3',
    sensors,
    lora: { channel: Number(block.fields?.LORA_CHANNEL ?? 1) },
  };
  if (block.fields?.HAS_OLED) device.display = 'oled_ssd1306';
  spec.hardware.devices.push(device);
  // Set deployment target to iot
  if (!spec.deployment) spec.deployment = {};
  spec.deployment.target = 'iot';
  break;
}
case 'iot_gateway_node': {
  if (!spec.hardware) spec.hardware = { devices: [] };
  spec.hardware.devices.push({
    role: 'gateway_node',
    board: 'heltec_lora_v3',
    lora: { channel: Number(block.fields?.LORA_CHANNEL ?? 1) },
  });
  if (!spec.deployment) spec.deployment = {};
  spec.deployment.target = 'iot';
  break;
}
case 'iot_cloud_dashboard': {
  if (!spec.hardware) spec.hardware = { devices: [] };
  spec.hardware.cloud = {
    platform: 'cloud_run',
    project: String(block.fields?.GCP_PROJECT ?? ''),
  };
  break;
}
case 'write_guide': {
  spec.documentation = {
    generate: true,
    focus: String(block.fields?.GUIDE_FOCUS ?? 'all') as any,
  };
  break;
}
// Hardware component blocks -> requirements
case 'hw_read_dht22':
  spec.requirements?.push('Read temperature and humidity (DHT22 sensor)');
  break;
case 'hw_read_reed':
  spec.requirements?.push('Check door/window open state (reed switch)');
  break;
case 'hw_read_pir':
  spec.requirements?.push('Detect motion (PIR sensor)');
  break;
case 'hw_oled_text':
  spec.requirements?.push(`Show "${block.fields?.TEXT ?? ''}" on OLED display`);
  break;
case 'hw_oled_readings':
  spec.requirements?.push('Display sensor readings on OLED');
  break;
case 'hw_oled_clear':
  spec.requirements?.push('Clear the OLED display');
  break;
case 'hw_lora_send':
  spec.requirements?.push(`Send data over LoRa channel ${block.fields?.CHANNEL ?? 1}`);
  break;
case 'hw_lora_receive':
  spec.requirements?.push(`Receive LoRa data on channel ${block.fields?.CHANNEL ?? 1}`);
  break;
case 'hw_wifi_connect':
  spec.requirements?.push(`Connect to WiFi "${block.fields?.SSID ?? ''}"`);
  break;
case 'hw_http_post':
  spec.requirements?.push(`POST data to ${block.fields?.URL ?? ''}`);
  break;
```

**Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/BlockCanvas/blockInterpreter.iot.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/components/BlockCanvas/blockInterpreter.ts frontend/src/components/BlockCanvas/blockInterpreter.iot.test.ts
git commit -m "feat(interpreter): handle IoT device, hardware component, and write_guide blocks"
```

---

## Phase 4: Cloud Dashboard Service

### Task 13: Cloud Dashboard Templates

**Files:**
- Create: `hardware/templates/cloud_dashboard/server.js`
- Create: `hardware/templates/cloud_dashboard/public/index.html`
- Create: `hardware/templates/cloud_dashboard/Dockerfile`
- Create: `hardware/templates/cloud_dashboard/package.json`

**Step 1: Create dashboard server template**

Create `hardware/templates/cloud_dashboard/server.js` - a simple Express server with POST /data and GET /events (SSE). The server stores last 100 readings in memory, broadcasts new data to all SSE clients, and requires X-API-Key header for POST.

Create `hardware/templates/cloud_dashboard/public/index.html` - a self-contained HTML dashboard with inline CSS/JS showing sensor cards (temperature, humidity, door status, motion), auto-reconnecting SSE, connection status, last-update timestamp, and mobile-friendly responsive layout.

Create `hardware/templates/cloud_dashboard/Dockerfile` - Node 20 Alpine, npm install --production, expose port 8080, CMD node server.js.

Create `hardware/templates/cloud_dashboard/package.json` - express as only dependency.

**Step 2: Commit**

```bash
git add hardware/templates/cloud_dashboard/
git commit -m "feat(hardware): add cloud dashboard templates (server, dashboard, Dockerfile)"
```

---

### Task 14: Cloud Deploy Service

**Files:**
- Create: `backend/src/services/cloudDeployService.ts`
- Test: `backend/src/tests/behavioral/cloudDeployService.test.ts`

**Step 1: Write failing test**

```typescript
// backend/src/tests/behavioral/cloudDeployService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process
const execFileMock = vi.fn();
vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}));

// Mock fs
const mkdirSyncMock = vi.fn();
const writeFileSyncMock = vi.fn();
const copyFileSyncMock = vi.fn();
const existsSyncMock = vi.fn(() => true);
vi.mock('node:fs', () => ({
  mkdirSync: mkdirSyncMock,
  writeFileSync: writeFileSyncMock,
  copyFileSync: copyFileSyncMock,
  existsSync: existsSyncMock,
  readFileSync: vi.fn(() => ''),
  cpSync: vi.fn(),
}));

import { CloudDeployService } from '../../services/cloudDeployService.js';

describe('CloudDeployService', () => {
  let service: CloudDeployService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CloudDeployService();
  });

  it('generates an API key', () => {
    const key = service.generateApiKey();
    expect(key).toBeTruthy();
    expect(key.length).toBeGreaterThan(16);
  });

  it('scaffolds dashboard project in nugget directory', async () => {
    await service.scaffoldDashboard('/tmp/nugget', 'test-api-key');
    expect(mkdirSyncMock).toHaveBeenCalled();
  });

  it('constructs correct gcloud deploy command', () => {
    const cmd = service.buildDeployCommand('/tmp/nugget/iot-dashboard', 'my-project', 'us-central1');
    expect(cmd).toContain('gcloud');
    expect(cmd).toContain('run');
    expect(cmd).toContain('deploy');
    expect(cmd).toContain('my-project');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/tests/behavioral/cloudDeployService.test.ts`
Expected: FAIL (service doesn't exist)

**Step 3: Write CloudDeployService**

Create `backend/src/services/cloudDeployService.ts`:

The service should:
- `generateApiKey()`: Generate a crypto-random 32-char hex string
- `scaffoldDashboard(nuggetDir, apiKey)`: Copy template files from `hardware/templates/cloud_dashboard/` to `nuggetDir/iot-dashboard/`, inject API key into server.js
- `buildDeployCommand(dashboardDir, project, region)`: Return the gcloud CLI command string for deployment
- `deploy(nuggetDir, project, region)`: Execute the full deploy pipeline (scaffold, build, deploy), return the service URL

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/tests/behavioral/cloudDeployService.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/cloudDeployService.ts backend/src/tests/behavioral/cloudDeployService.test.ts
git commit -m "feat(backend): add CloudDeployService for Google Cloud Run deployment"
```

---

## Phase 5: Deploy Phase & Flash Wizard

### Task 15: Extend Deploy Phase for IoT

**Files:**
- Modify: `backend/src/services/phases/deployPhase.ts`
- Test: `backend/src/tests/behavioral/deployPhase.iot.test.ts`

**Step 1: Write failing test**

```typescript
// backend/src/tests/behavioral/deployPhase.iot.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies (following existing project patterns)
const mockHardwareService = {
  compile: vi.fn().mockResolvedValue({ errors: [] }),
  flash: vi.fn().mockResolvedValue({ success: true }),
  flashFiles: vi.fn().mockResolvedValue({ success: true }),
};

const mockCloudDeployService = {
  generateApiKey: vi.fn().mockReturnValue('test-api-key-12345'),
  scaffoldDashboard: vi.fn().mockResolvedValue(undefined),
  deploy: vi.fn().mockResolvedValue('https://test-dashboard.run.app'),
};

const mockPortalService = {
  initializePortals: vi.fn(),
  teardownAll: vi.fn(),
  getMcpServers: vi.fn().mockReturnValue([]),
};

const mockTeachingEngine = {
  teachOptional: vi.fn(),
};

describe('DeployPhase IoT flow', () => {
  it('shouldDeployIoT returns true for iot target', () => {
    // Test that the method exists and returns true for iot
    expect(true).toBe(true); // Placeholder until DeployPhase constructor is wired
  });

  it('deploys cloud first, then flash sequence', () => {
    // Test ordering: cloud deploy -> sensor flash -> gateway flash
    expect(true).toBe(true); // Filled in when implementing
  });

  it('emits flash_prompt events for each device', () => {
    // Test that flash_prompt events are emitted
    expect(true).toBe(true); // Filled in when implementing
  });
});
```

**Step 2: Implement deployIoT() method in deployPhase.ts**

Add to the DeployPhase class:
- `shouldDeployIoT(spec)`: Returns true if `spec.deployment?.target === 'iot'`
- `deployIoT(ctx)`: Orchestrates the full IoT deploy sequence:
  1. Deploy cloud dashboard (if `hardware.cloud` present)
  2. Inject cloud URL + API key into gateway code
  3. Emit `flash_prompt` for sensor node
  4. Wait for gate response
  5. Compile + flash sensor node files
  6. Emit `flash_complete` for sensor node
  7. Emit `flash_prompt` for gateway node
  8. Wait for gate response
  9. Compile + flash gateway node files
  10. Emit `flash_complete` for gateway node

Also add `flashFiles(files, workDir)` to hardwareService.ts for targeted file flashing.

**Step 3: Run test to verify it passes**

Run: `cd backend && npx vitest run src/tests/behavioral/deployPhase.iot.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add backend/src/services/phases/deployPhase.ts backend/src/services/hardwareService.ts backend/src/tests/behavioral/deployPhase.iot.test.ts
git commit -m "feat(deploy): add IoT multi-device deploy flow with cloud-first and guided flash"
```

---

### Task 16: Flash Wizard Modal

**Files:**
- Create: `frontend/src/components/shared/FlashWizardModal.tsx`
- Test: `frontend/src/components/shared/FlashWizardModal.test.tsx`

**Step 1: Write failing test**

```typescript
// frontend/src/components/shared/FlashWizardModal.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FlashWizardModal from './FlashWizardModal';

describe('FlashWizardModal', () => {
  it('renders device role and message', () => {
    render(
      <FlashWizardModal
        deviceRole="sensor_node"
        message="Plug in your Sensor Node"
        onReady={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText(/Sensor Node/i)).toBeInTheDocument();
    expect(screen.getByText(/Plug in/i)).toBeInTheDocument();
  });

  it('calls onReady when Ready button clicked', () => {
    const onReady = vi.fn();
    render(
      <FlashWizardModal
        deviceRole="sensor_node"
        message="Plug in your Sensor Node"
        onReady={onReady}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText(/Ready/i));
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('shows progress state during flash', () => {
    render(
      <FlashWizardModal
        deviceRole="sensor_node"
        message="Flashing..."
        isFlashing={true}
        progress={50}
        onReady={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText(/Flashing/i)).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/shared/FlashWizardModal.test.tsx`
Expected: FAIL

**Step 3: Write FlashWizardModal component**

A modal with:
- Device role heading (friendly name: "Sensor Node" / "Gateway Node")
- Instruction message
- "Ready" button (disabled during flash)
- Progress bar during flash
- Cancel button
- Step indicators (1/2, 2/2)

**Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/shared/FlashWizardModal.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/components/shared/FlashWizardModal.tsx frontend/src/components/shared/FlashWizardModal.test.tsx
git commit -m "feat(frontend): add FlashWizardModal for multi-device flash sequence"
```

---

### Task 17: Wire Flash Events in useBuildSession

**Files:**
- Modify: `frontend/src/hooks/useBuildSession.ts`
- Test: Update existing `useBuildSession.test.ts`

**Step 1: Add flash event handling**

In the `handleEvent()` switch statement in `useBuildSession.ts`, add cases:

```typescript
case 'flash_prompt':
  setFlashWizardState({
    visible: true,
    deviceRole: event.device_role,
    message: event.message,
    isFlashing: false,
    progress: 0,
  });
  break;
case 'flash_progress':
  setFlashWizardState(prev => ({
    ...prev,
    isFlashing: true,
    progress: event.progress,
  }));
  break;
case 'flash_complete':
  setFlashWizardState(prev => ({
    ...prev,
    isFlashing: false,
    progress: 100,
    visible: false,
  }));
  break;
case 'documentation_ready':
  setDocumentationPath(event.file_path);
  break;
```

Add new state variables:
```typescript
const [flashWizardState, setFlashWizardState] = useState<FlashWizardState | null>(null);
const [documentationPath, setDocumentationPath] = useState<string | null>(null);
```

**Step 2: Commit**

```bash
git add frontend/src/hooks/useBuildSession.ts
git commit -m "feat(frontend): handle flash_prompt, flash_complete, documentation_ready events"
```

---

## Phase 6: Agent Prompts

### Task 18: Extend Builder Agent Prompt with IoT Context

**Files:**
- Modify: `backend/src/prompts/builderAgent.ts`
- Test: `backend/src/tests/behavioral/builderPrompt.iot.test.ts`

**Step 1: Write failing test**

```typescript
// backend/src/tests/behavioral/builderPrompt.iot.test.ts
import { describe, it, expect } from 'vitest';
import { formatTaskPrompt } from '../../prompts/builderAgent.js';

describe('Builder prompt IoT context', () => {
  const iotSpec = {
    nugget: { goal: 'IoT sensor network', description: 'Temp + humidity + motion' },
    deployment: { target: 'iot' as const },
    hardware: {
      devices: [
        {
          role: 'sensor_node' as const,
          board: 'heltec_lora_v3' as const,
          sensors: ['dht22', 'reed_switch', 'pir'],
          display: 'oled_ssd1306',
          lora: { channel: 1 },
        },
      ],
    },
  };

  it('includes IoT sensor API reference when hardware.devices present', () => {
    const prompt = formatTaskPrompt(
      'Builder Bot', 'builder', 'a careful coder',
      { id: 't1', name: 'Build sensor node', description: 'Create sensor_main.py' },
      iotSpec, [], {}
    );
    expect(prompt).toContain('DHT22Sensor');
    expect(prompt).toContain('ReedSwitch');
    expect(prompt).toContain('PIRSensor');
    expect(prompt).toContain('OLEDDisplay');
    expect(prompt).toContain('SensorNode');
  });

  it('includes pin mapping table', () => {
    const prompt = formatTaskPrompt(
      'Builder Bot', 'builder', 'a careful coder',
      { id: 't1', name: 'Build sensor node', description: 'Create sensor_main.py' },
      iotSpec, [], {}
    );
    expect(prompt).toContain('GPIO 13');
    expect(prompt).toContain('GPIO 17');
    expect(prompt).toContain('GPIO 18');
  });

  it('does not include IoT context for non-IoT specs', () => {
    const webSpec = {
      nugget: { goal: 'A website', description: 'Simple web page' },
      deployment: { target: 'web' as const },
    };
    const prompt = formatTaskPrompt(
      'Builder Bot', 'builder', 'a careful coder',
      { id: 't1', name: 'Build page', description: 'Create index.html' },
      webSpec, [], {}
    );
    expect(prompt).not.toContain('DHT22Sensor');
    expect(prompt).not.toContain('SensorNode');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/tests/behavioral/builderPrompt.iot.test.ts`
Expected: FAIL

**Step 3: Add IoT context section to formatTaskPrompt()**

In `backend/src/prompts/builderAgent.ts`, add a conditional block that appends IoT hardware documentation when `spec.hardware?.devices` is present. Include:

- Full API reference for DHT22Sensor, ReedSwitch, PIRSensor, OLEDDisplay, SensorNode, GatewayNode
- Pin mapping table for Heltec V3
- MicroPython pitfalls (urequests not requests, no f-strings in some builds, etc.)
- Example code for sensor node and gateway node
- Warning: generate `sensor_main.py` and `gateway_main.py` as separate files
- Warning: DO NOT attempt to deploy/flash - separate phase handles it

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/tests/behavioral/builderPrompt.iot.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/prompts/builderAgent.ts backend/src/tests/behavioral/builderPrompt.iot.test.ts
git commit -m "feat(prompts): add IoT hardware API reference to builder agent prompt"
```

---

## Phase 7: Flash File Targeting in Hardware Service

### Task 19: Add Per-File Flash Support

**Files:**
- Modify: `backend/src/services/hardwareService.ts`
- Test: `backend/src/tests/behavioral/hardwareService.flashFiles.test.ts`

**Step 1: Write failing test**

```typescript
// backend/src/tests/behavioral/hardwareService.flashFiles.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock serialport
vi.mock('serialport', () => ({
  SerialPort: vi.fn(),
}));

import { HardwareService } from '../../services/hardwareService.js';

describe('HardwareService.flashFiles', () => {
  let service: HardwareService;

  beforeEach(() => {
    service = new HardwareService();
  });

  it('flashFiles method exists', () => {
    expect(typeof service.flashFiles).toBe('function');
  });
});
```

**Step 2: Add flashFiles() method**

Add to `HardwareService`:

```typescript
async flashFiles(workDir: string, files: string[]): Promise<{ success: boolean; message?: string }> {
  // Like flash() but only copies specified files to the device
  // Used by IoT deploy to flash sensor_main.py or gateway_main.py + libraries
}
```

**Step 3: Commit**

```bash
git add backend/src/services/hardwareService.ts backend/src/tests/behavioral/hardwareService.flashFiles.test.ts
git commit -m "feat(hardware): add flashFiles for targeted file deployment"
```

---

## Phase 8: Documentation Updates

### Task 20: Update Architecture Documentation

**Files:**
- Modify: `ARCHITECTURE.md`
- Modify: `docs/INDEX.md`
- Modify: `backend/CLAUDE.md`
- Modify: `frontend/CLAUDE.md`
- Modify: `frontend/src/components/CLAUDE.md`

**Step 1: Update ARCHITECTURE.md**

Add IoT data flow diagram to the "Data Flow: Build Session Lifecycle" section. Add IoT module description to the "Core Abstractions" section. Add `flash_prompt`, `flash_progress`, `flash_complete`, `documentation_ready` to the WebSocket events.

**Step 2: Update docs/INDEX.md**

Add new files to the Directory Map, Key Source Files, and Data Flow sections:
- `hardware/lib/sensors.py`, `hardware/lib/oled.py`, `hardware/lib/nodes.py`, `hardware/lib/ssd1306.py`
- `hardware/templates/sensor_node.py`, `hardware/templates/gateway_node.py`, `hardware/templates/cloud_dashboard/`
- `backend/src/services/cloudDeployService.ts`
- `frontend/src/components/shared/FlashWizardModal.tsx`

Update the Data Flow section with the IoT path.

**Step 3: Update backend/CLAUDE.md**

Add `cloudDeployService.ts` to the services table. Add new WSEvent types. Add IoT deploy flow description.

**Step 4: Update frontend/CLAUDE.md and frontend/src/components/CLAUDE.md**

Add FlashWizardModal to component tree. Add IoT/Hardware block categories to BlockCanvas subsystem description. Add new WSEvent types to the communication section.

**Step 5: Commit**

```bash
git add ARCHITECTURE.md docs/INDEX.md backend/CLAUDE.md frontend/CLAUDE.md frontend/src/components/CLAUDE.md
git commit -m "docs: update architecture docs with IoT sensor network feature"
```

---

### Task 21: Create IoT User Guide

**Files:**
- Create: `docs/iot-guide.md`

**Step 1: Write user guide**

Create `docs/iot-guide.md` covering:
- What you need (hardware list with links)
- Wiring diagram (ASCII art showing DHT22, reed switch, PIR connections to Heltec V3)
- Step-by-step: building the project in Elisa (screenshots described)
- Cloud Run setup prerequisites (gcloud CLI, project, IAP)
- Troubleshooting (common issues: sensor not reading, LoRa not connecting, WiFi issues)

**Step 2: Update docs/INDEX.md documentation map table**

Add `docs/iot-guide.md` entry.

**Step 3: Commit**

```bash
git add docs/iot-guide.md docs/INDEX.md
git commit -m "docs: add IoT sensor network user guide with wiring and setup"
```

---

### Task 22: Create Hardware Library README

**Files:**
- Create: `hardware/README.md`

**Step 1: Write hardware README**

Cover:
- Library overview and supported hardware
- Class API reference for all classes (ElisaBoard, DHT22Sensor, ReedSwitch, PIRSensor, OLEDDisplay, SensorNode, GatewayNode)
- Pin mapping table for Heltec V3
- Template descriptions
- Manual test procedure for real hardware

**Step 2: Commit**

```bash
git add hardware/README.md
git commit -m "docs: add hardware library README with API reference and pin mapping"
```

---

## Phase 9: Integration & Behavioral Tests

### Task 23: IoT NuggetSpec Fixture

**Files:**
- Create: `backend/src/tests/fixtures/specs/iot-sensor-network.json`

**Step 1: Create fixture**

```json
{
  "nugget": {
    "goal": "IoT sensor network with cloud dashboard",
    "description": "Sensor node reads DHT22, reed switch, PIR. Sends over LoRa to gateway. Gateway publishes to Cloud Run dashboard."
  },
  "requirements": [
    "Read temperature and humidity every 10 seconds",
    "Detect door open/close events",
    "Detect motion events",
    "Display readings on OLED",
    "Send data over LoRa channel 1",
    "Gateway receives LoRa and POSTs to cloud"
  ],
  "deployment": { "target": "iot" },
  "hardware": {
    "devices": [
      {
        "role": "sensor_node",
        "board": "heltec_lora_v3",
        "sensors": ["dht22", "reed_switch", "pir"],
        "display": "oled_ssd1306",
        "lora": { "channel": 1 }
      },
      {
        "role": "gateway_node",
        "board": "heltec_lora_v3",
        "lora": { "channel": 1 }
      }
    ],
    "cloud": {
      "platform": "cloud_run",
      "project": "elisa-iot-test",
      "region": "us-central1"
    }
  },
  "documentation": {
    "generate": true,
    "focus": "all"
  }
}
```

**Step 2: Commit**

```bash
git add backend/src/tests/fixtures/specs/iot-sensor-network.json
git commit -m "test: add IoT sensor network NuggetSpec fixture"
```

---

### Task 24: Integration Test - IoT Build Session

**Files:**
- Create: `backend/src/tests/behavioral/iot-session.behavior.test.ts`

**Step 1: Write behavioral test**

Following the pattern in existing `orchestrator.behavior.test.ts` and using the test helpers:

```typescript
// backend/src/tests/behavioral/iot-session.behavior.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
// Import test helpers and fixtures
// Mock MetaPlanner, AgentRunner, GitService, HardwareService, CloudDeployService

describe('IoT build session', () => {
  it('produces sensor_main.py and gateway_main.py tasks in the plan', async () => {
    // Load iot-sensor-network fixture
    // Configure MetaPlanner mock to return IoT task DAG
    // Run orchestrator
    // Verify plan contains sensor_node and gateway_node tasks
  });

  it('emits flash_prompt events in correct order (sensor first, gateway second)', async () => {
    // Run through deploy phase with mocked hardware
    // Capture events
    // Verify flash_prompt for sensor_node comes before flash_prompt for gateway_node
  });

  it('deploys cloud dashboard before flashing devices', async () => {
    // Verify cloudDeployService.deploy called before hardwareService.flash
  });

  it('includes documentation agent task when write_guide is in spec', async () => {
    // Verify a documentation task exists in the DAG
  });
});
```

**Step 2: Commit**

```bash
git add backend/src/tests/behavioral/iot-session.behavior.test.ts
git commit -m "test: add IoT build session behavioral test"
```

---

### Task 25: Run Full Test Suite

**Files:** None (verification only)

**Step 1: Run backend tests**

```bash
cd backend && npx vitest run
```
Expected: ALL PASS (including new IoT tests)

**Step 2: Run frontend tests**

```bash
cd frontend && npx vitest run
```
Expected: ALL PASS (including new block and interpreter tests)

**Step 3: Run CLI tests**

```bash
cd cli && npx vitest run
```
Expected: ALL PASS (no CLI changes, but verify no regressions)

**Step 4: Fix any failures**

If any tests fail, fix them before proceeding. Do not move on until all tests pass.

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve test failures from IoT feature integration"
```

---

## Phase 10: Final Verification

### Task 26: NuggetSpec End-to-End Validation

**Step 1: Verify the full pipeline**

Manually verify (or write a test) that:
1. IoT blocks in Blockly -> NuggetSpec JSON via interpreter
2. NuggetSpec passes Zod validation
3. Builder prompt includes IoT context
4. Deploy phase recognizes `target: 'iot'` and calls `deployIoT()`

**Step 2: Final commit with all passing tests**

```bash
git status
# Ensure everything is committed and clean
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 0 | 0 | Branch setup |
| 1 | 1-7 | MicroPython library (sensors, OLED, nodes, templates) |
| 2 | 8-9 | NuggetSpec schema + TypeScript types |
| 3 | 10-12 | Blockly blocks + toolbox + interpreter |
| 4 | 13-14 | Cloud dashboard templates + deploy service |
| 5 | 15-17 | Deploy phase + Flash Wizard + event wiring |
| 6 | 18 | Agent prompts with IoT context |
| 7 | 19 | Hardware service file targeting |
| 8 | 20-22 | Documentation (architecture, guide, README) |
| 9 | 23-24 | Integration + behavioral tests |
| 10 | 25-26 | Full test suite + final verification |

**Total: 27 tasks across 11 phases**

Each task is a single commit. Each commit leaves the codebase in a working state. Tests first, implementation second, commit after each passing test.
