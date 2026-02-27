"""OLED display abstraction for Heltec WiFi LoRa V3/V4 (SSD1306 128x64).

Heltec V3/V4 has an onboard SSD1306 OLED connected via I2C:
  Vext = GPIO 36 (must be LOW to power OLED)
  SDA  = GPIO 17
  SCL  = GPIO 18
  RST  = GPIO 21 (must be toggled on init)

All drawing operations are buffered. Call show() to flush to display.
"""

# Heltec V3/V4 OLED pin defaults
OLED_SDA = 17
OLED_SCL = 18
OLED_RST = 21
OLED_WIDTH = 128
OLED_HEIGHT = 64
OLED_I2C_ADDR = 0x3C


class OLEDDisplay:
    """SSD1306 OLED display wrapper with convenience methods.

    Initializes with Heltec V3/V4 defaults. Enables Vext power, toggles RST pin.
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

            # Enable Vext power (GPIO 36 LOW) -- Heltec V3/V4 gates OLED
            # power through this pin; without it, I2C bus times out
            vext = Pin(36, Pin.OUT)
            vext.value(0)
            time.sleep_ms(100)

            # Reset OLED (required for Heltec V3/V4)
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
