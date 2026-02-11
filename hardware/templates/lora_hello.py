"""Minimal LoRa send/receive example for Elisa on Heltec WiFi LoRa 32 V3."""

from elisa_hardware import ElisaBoard
import time

board = ElisaBoard()

def on_message(msg, channel):
    print(f"Received on channel {channel}: {msg}")
    board.led_blink(times=1, speed="fast")

# Listen for messages on channel 1
board.on_message(on_message, channel=1)

print("Elisa LoRa Hello -- starting!")
print("Sending a message every 5 seconds...")

counter = 0
while True:
    counter += 1
    board.send_message(f"Hello #{counter}", channel=1)
    time.sleep(5)
