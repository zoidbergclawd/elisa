# Device Plugins -- Build with Real Hardware

Device plugins are like instruction manuals for hardware boards. Each plugin teaches Elisa how to talk to a specific device -- what sensors it has, how to generate code for it, and how to flash code onto it.

When Elisa starts, it loads all the plugins from the `devices/` folder. Each plugin adds new blocks to your toolbox automatically. Drag a device block onto your canvas just like any other block.

## What is in the box

Elisa ships with four device plugins that work together to build IoT sensor networks:

| Plugin | What it does | Hardware needed | Difficulty |
|--------|-------------|-----------------|------------|
| **Heltec Blink** | Blinks the onboard LED on and off | 1 Heltec board + USB cable | Beginner |
| **Sensor Node** | Reads temperature, humidity, door open/close, and motion. Broadcasts data wirelessly via LoRa. | 1 Heltec board + sensors (see below) | Intermediate |
| **Gateway Node** | Receives LoRa data and forwards it to the cloud over WiFi | 1 Heltec board + USB cable | Intermediate |
| **Cloud Dashboard** | Real-time web dashboard showing live sensor data | No hardware (runs in the cloud) | Intermediate |

The Sensor Node, Gateway, and Cloud Dashboard are designed to work together as a complete IoT sensor network. But you can also use the Heltec Blink plugin on its own for a quick first hardware project.

---

## Getting Started: Blinky Board

This is the fastest way to get hardware working with Elisa. You only need one board and one USB cable.

### What you need

- 1 Heltec WiFi LoRa V3 board
- 1 USB-C data cable (not a charge-only cable)
- Python 3.10+ with mpremote installed: `pip install mpremote`

### Build it

1. Open Elisa and start with a fresh canvas.
2. Drag a **Goal** block and type: "Blink the LED on my ESP32 board"
3. Open the **Devices** category in the toolbox. Drag a **Heltec Blink** block onto the canvas.
4. Pick a speed: Normal, Fast, or Slow.
5. Drag a **Deploy ESP32** block from the Deploy category.
6. Press **GO** and choose a folder.

The AI minions will write MicroPython code to blink the LED, then the Flash Wizard will appear:

> "Plug in your Heltec board and click Ready"

1. Plug in your board with a USB-C cable.
2. Wait a moment for your computer to recognize it.
3. Click **Ready**.
4. Watch the progress bar. When it says "Flash complete!", your board's LED should start blinking!

You just built and deployed your first hardware project.
