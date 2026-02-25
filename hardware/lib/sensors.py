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
