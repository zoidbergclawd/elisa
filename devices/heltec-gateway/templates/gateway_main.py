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
