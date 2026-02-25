"""Minimal LED blink example for Elisa on Heltec WiFi LoRa 32 V3."""

from elisa_hardware import ElisaBoard
import time

board = ElisaBoard()

print("Elisa LED Blink -- starting!")

while True:
    board.led_blink(times=3, speed="normal")
    time.sleep(2)
