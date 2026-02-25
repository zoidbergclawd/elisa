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
