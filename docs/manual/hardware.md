# Hardware

Elisa can compile MicroPython code and flash it to ESP32 boards over USB.

## What you need

- An ESP32 development board (see supported boards below)
- A USB cable to connect the board to your computer
- USB drivers for your board (most install automatically)
- Python 3.10+ with `mpremote` installed: `pip install mpremote`

## Supported boards

Elisa recognizes these boards by their USB vendor/product IDs:

| Board | USB Chip | VID:PID |
|-------|----------|---------|
| Heltec WiFi LoRa 32 V3 | CP210x | 10C4:EA60 |
| ESP32-S3 (native USB) | Built-in CDC | 303A:1001 / 303A:4001 |
| ESP32 (CH9102) | CH9102 | 1A86:55D4 |
| Any Espressif device | Native USB | 303A:* |

Boards not in this list can still work -- Elisa falls back to probing serial ports for a MicroPython REPL prompt.

## Board auto-detection

When you are in design mode, Elisa periodically checks for connected boards by scanning USB serial ports. Detection uses VID:PID matching (fast, does not open the port).

When a new board is plugged in:

1. A chime plays.
2. A "Board Connected!" modal appears showing the board type and port.
3. You can click **Create Portal** to automatically set up a Serial portal for the board.
4. Or click **Maybe later** to dismiss (the same board will not trigger the modal again until you restart).

If a portal already exists for that port, the modal offers "View Portals" instead.

## Using hardware in your design

To build a hardware project:

1. Add a **Goal** block describing what you want the board to do.
2. Optionally add a **Template** block set to "Hardware Nugget".
3. Add a **Deploy ESP32** block (or **Deploy Both** for web + hardware).
4. Optionally create a Serial portal for your board (for Tell/When/Ask blocks).
5. Press **GO**.

## What happens during a hardware build

1. **Planning** -- Agents plan MicroPython tasks.
2. **Coding** -- Builder agents write `.py` files.
3. **Compile** -- Elisa runs `py_compile` on each Python file to check for syntax errors.
4. **Flash** -- Files are sent to the board. Elisa tries serial paste mode first (works for all MicroPython boards including ESP32-S3 native USB), then falls back to `mpremote` if needed. The flash has a 60-second timeout with up to 3 retries.
5. **Serial monitor** -- After flashing, the Board tab in the bottom bar shows serial output from the running program.

## The Board tab

The Board tab in the bottom bar shows real-time serial output from a connected board at 115200 baud. Each line shows a timestamp and the output text. The display caps at 1000 lines (oldest lines are removed).

## Troubleshooting

**Board not detected**
- Check the USB cable (some cables are charge-only with no data wires).
- Try a different USB port.
- Install the driver for your board's USB chip (CP210x driver for Heltec, CH9102 driver for some ESP32 boards).
- On Windows, check Device Manager for the COM port.

**Flash failed**
- Make sure no other program (serial monitor, Arduino IDE) has the port open.
- Try pressing the RST (reset) button on the board and flashing again.
- Check that Python and mpremote are installed: `pip install mpremote`.

**No MicroPython REPL**
- Your board may not have MicroPython firmware installed. Flash the MicroPython firmware first using [micropython.org](https://micropython.org/download/).

**Serial monitor shows nothing**
- Press the RST button on the board to restart the program.
- Make sure your MicroPython code has `print()` statements.
