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

---

## Building a Sensor Network

Your finished project will have two devices talking to each other wirelessly, plus a cloud dashboard:

```
  Sensor Node                Gateway Node              Cloud Dashboard
+----------------+         +----------------+       +------------------+
| DHT22 (temp)   |  LoRa   | Receives data  | WiFi  | Live gauges      |
| Reed (door)    |-------->| over LoRa      |------>| Temperature      |
| PIR (motion)   | 915 MHz | Sends to cloud | HTTP  | Humidity         |
| OLED display   |         | over WiFi      |       | Door / Motion    |
+----------------+         +----------------+       +------------------+
```

### What You Need

#### Boards

You need two Heltec WiFi LoRa V3 boards. One becomes the Sensor Node and the other becomes the Gateway Node. These boards have WiFi, LoRa radio, and a tiny OLED screen built in -- no extra radio modules needed.

| Item | Quantity | Notes |
|------|----------|-------|
| Heltec WiFi LoRa V3 | 2 | One for Sensor Node, one for Gateway Node |
| USB-C cable | 2 | For flashing code to each board. Make sure they carry data, not just power. |

#### Sensors (for the Sensor Node)

| Sensor | What it measures | Notes |
|--------|-----------------|-------|
| DHT22 / AM2302 | Temperature and humidity | The blue one with a grid on the front. Comes on a small breakout board with 3 pins. |
| Magnetic reed switch | Door or window open/close | Two-piece magnet sensor. One piece goes on the door frame, one on the door. |
| HC-SR501 PIR sensor | Motion | The dome-shaped sensor. Detects people and animals moving nearby. |

#### Other parts

| Item | Quantity | Notes |
|------|----------|-------|
| 10K ohm resistor | 1 | Pull-up resistor for the DHT22 data pin |
| Jumper wires | ~10 | Male-to-female recommended (plug into breadboard and sensor pins) |
| Breadboard | 1 | Optional but makes wiring much easier |

---

### Wiring Guide

Only the **Sensor Node** board needs wiring. The Gateway Node has no sensors -- just plug it in with USB and you are done.

The OLED screen is built into the Heltec board. No wiring needed for that.

#### Pin Map

| Sensor | Board Pin | Wire Color (suggested) |
|--------|-----------|----------------------|
| DHT22 data | GPIO 13 | Yellow |
| DHT22 power (VCC) | 3.3V | Red |
| DHT22 ground (GND) | GND | Black |
| Reed switch (one leg) | GPIO 12 | Green |
| Reed switch (other leg) | GND | Black |
| PIR output | GPIO 14 | Orange |
| PIR power (VCC) | 3.3V | Red |
| PIR ground (GND) | GND | Black |

#### Wiring Diagram

```
Heltec WiFi LoRa V3 (Sensor Node)
+---------------------------------------+
|                                       |
|  [OLED Screen - built in]             |
|                                       |
|  3.3V ----+------+------+            |
|           |      |      |            |
|          [R]    VCC    VCC           |
|          10K     |      |            |
|           |    DHT22   PIR           |
|  GPIO 13--+--DATA  OUT------ GPIO 14 |
|              GND    GND              |
|               |      |               |
|  GND --------+------+------+        |
|                             |        |
|  GPIO 12 ----[REED]--------+        |
|              (switch)                 |
|                                       |
+---------------------------------------+
```

#### Step-by-step wiring

**DHT22 (temperature and humidity)**

1. Connect the DHT22 VCC pin to 3.3V on the board.
2. Connect the DHT22 GND pin to GND on the board.
3. Connect the DHT22 DATA pin to GPIO 13 on the board.
4. Place the 10K resistor between the DATA pin and 3.3V. This is the "pull-up resistor" -- it keeps the signal clean. Without it, the sensor gives bad readings.

**Reed switch (door/window sensor)**

1. Connect one leg of the reed switch to GPIO 12.
2. Connect the other leg to GND.
3. No extra resistor needed -- the board uses an internal pull-up.

**PIR motion sensor (HC-SR501)**

1. Connect the PIR VCC pin to 3.3V on the board.
2. Connect the PIR GND pin to GND on the board.
3. Connect the PIR OUT pin to GPIO 14 on the board.
4. Tip: The PIR sensor has two small orange knobs on the back. The left one sets sensitivity (turn clockwise for more sensitive). The right one sets how long it stays triggered (turn counter-clockwise for shorter, about 2-3 seconds is good).

**Double-check before powering on:**

- Red wires go to 3.3V (NOT 5V -- the sensors work at 3.3V and so does the board)
- Black wires go to GND
- Data/signal wires go to the correct GPIO pins
- The 10K pull-up resistor connects DHT22 DATA to 3.3V
