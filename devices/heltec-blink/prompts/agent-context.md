# Heltec Blink — Agent Context

You are building a simple MicroPython LED blink project for the Heltec WiFi LoRa V3 (ESP32-S3).

## ElisaBoard Class (from elisa_hardware.py)

```python
from elisa_hardware import ElisaBoard

board = ElisaBoard()

# LED control
board.led_on()
board.led_off()
board.led_blink(times=3, speed="normal")  # speed: "slow", "normal", "fast"

# Button (GPIO 0)
board.on_button_press(lambda: print("pressed!"))

# LoRa messaging (SX1262, 915 MHz)
board.send_message("hello", channel=1)
board.on_message(lambda msg, ch: print(f"got: {msg}"), channel=1)

# Buzzer
board.play_tone(freq=1000, duration=0.5)

# Sensors
temp = board.read_sensor("temperature")
```

## Key Constraints

- Write MicroPython code (not CPython, not JavaScript)
- The LED is on GPIO 35
- Use `from machine import Pin` for GPIO
- Keep the main loop alive with `while True:` and `time.sleep()`
- DO NOT attempt to deploy or flash — a separate deploy phase handles that
- NEVER use emoji or unicode characters beyond ASCII
