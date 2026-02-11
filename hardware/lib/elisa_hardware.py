"""Elisa hardware abstraction library for MicroPython on Heltec WiFi LoRa 32 V3."""

from machine import Pin, PWM
import time


class ElisaBoard:
    """Hardware abstraction for the Heltec WiFi LoRa 32 V3 board."""

    # Pin assignments for Heltec WiFi LoRa 32 V3
    LED_PIN = 35
    BUTTON_PIN = 0

    SPEED_MAP = {
        "slow": 1000,
        "normal": 500,
        "fast": 200,
    }

    def __init__(self):
        self.led = Pin(self.LED_PIN, Pin.OUT)
        self.button = Pin(self.BUTTON_PIN, Pin.IN, Pin.PULL_UP)
        self._buzzer = None
        self._lora = None
        self._button_callback = None

    def led_on(self):
        """Turn the onboard LED on."""
        self.led.value(1)

    def led_off(self):
        """Turn the onboard LED off."""
        self.led.value(0)

    def led_blink(self, times=3, speed="normal"):
        """Blink the LED a number of times at the given speed.

        Args:
            times: Number of blinks
            speed: One of 'slow', 'normal', 'fast'
        """
        delay_ms = self.SPEED_MAP.get(speed, 500)
        for _ in range(times):
            self.led_on()
            time.sleep_ms(delay_ms)
            self.led_off()
            time.sleep_ms(delay_ms)

    def on_button_press(self, callback):
        """Register a callback for button press events.

        Args:
            callback: Function to call when button is pressed (no args)
        """
        self._button_callback = callback
        self.button.irq(trigger=Pin.IRQ_FALLING, handler=lambda p: callback())

    def send_message(self, msg, channel=1):
        """Send a LoRa message on the specified channel.

        Falls back to print() if SX1262 driver is unavailable.

        Args:
            msg: Message string to send
            channel: LoRa channel number
        """
        try:
            from sx1262 import SX1262
            if self._lora is None:
                self._lora = SX1262(spi_bus=1, clk=9, mosi=10, miso=11,
                                    cs=8, irq=14, rst=12, gpio=13)
                self._lora.begin(freq=915.0, bw=125.0, sf=7, cr=5,
                                 syncWord=0x12, power=14)
            self._lora.send(bytes(f"[ch{channel}]{msg}", "utf-8"))
        except ImportError:
            print(f"[LoRa TX ch{channel}] {msg}")

    def on_message(self, callback, channel=1):
        """Register a callback for incoming LoRa messages.

        Falls back to print() if SX1262 driver is unavailable.

        Args:
            callback: Function to call with (message_string, channel)
            channel: LoRa channel to listen on
        """
        try:
            from sx1262 import SX1262
            if self._lora is None:
                self._lora = SX1262(spi_bus=1, clk=9, mosi=10, miso=11,
                                    cs=8, irq=14, rst=12, gpio=13)
                self._lora.begin(freq=915.0, bw=125.0, sf=7, cr=5,
                                 syncWord=0x12, power=14)
            self._lora.setBlockingCallback(False, lambda: callback(
                self._lora.recv().decode("utf-8"), channel
            ))
        except ImportError:
            print(f"[LoRa RX ch{channel}] Listening (stub mode)")

    def play_tone(self, freq=1000, duration=0.5):
        """Play a tone on the buzzer.

        Args:
            freq: Frequency in Hz
            duration: Duration in seconds
        """
        try:
            if self._buzzer is None:
                self._buzzer = PWM(Pin(2))
            self._buzzer.freq(int(freq))
            self._buzzer.duty(512)
            time.sleep(duration)
            self._buzzer.duty(0)
        except Exception:
            print(f"[Buzzer] {freq}Hz for {duration}s")

    def read_sensor(self, sensor_type="temperature"):
        """Read a sensor value.

        Args:
            sensor_type: One of 'temperature', 'light', 'motion', 'custom'

        Returns:
            Sensor reading value (float) or None if sensor unavailable
        """
        try:
            from machine import ADC
            if sensor_type == "temperature":
                adc = ADC(Pin(36))
                raw = adc.read()
                # Simple conversion for common temperature sensor
                return raw * 3.3 / 4095 * 100
            elif sensor_type == "light":
                adc = ADC(Pin(39))
                raw = adc.read()
                return raw * 100 / 4095
            elif sensor_type == "motion":
                motion_pin = Pin(4, Pin.IN)
                return float(motion_pin.value())
            else:
                return None
        except Exception:
            print(f"[Sensor] Reading {sensor_type} (stub mode)")
            return None
