"""Elisa IoT Gateway Node -- receives LoRa data, publishes to cloud dashboard.

Comms: LoRa RX @ 915 MHz, WiFi -> HTTP POST to Cloud Run
Config: WiFi credentials from device block fields (injected as __PLACEHOLDER__),
        cloud URL and API key from config.py (written at deploy time).
"""

import sys
from elisa_hardware import ElisaBoard
from nodes import GatewayNode
from oled import OLEDDisplay

# WiFi credentials (injected by deploy phase template replacement)
LORA_CHANNEL = __LORA_CHANNEL__
WIFI_SSID = "__WIFI_SSID__"
WIFI_PASS = "__WIFI_PASS__"

# Cloud URL and API key come from config.py, written by the deploy phase
# with values from the cloud dashboard deploy step.
try:
    from config import CLOUD_URL, API_KEY
except ImportError:
    CLOUD_URL = ""
    API_KEY = ""
    print("[gateway_main] WARNING: config.py not found -- cloud POST disabled")

# Initialize hardware
board = ElisaBoard()
display = OLEDDisplay()

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
    display=display,
)
gateway.start()
