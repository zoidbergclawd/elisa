# Feasibility Update: Electron Desktop App & Hardware Service

**Date:** 2026-02-11
**Branch:** `feature/electron-desktop-app`
**Status:** In Progress / Analysis

## 1. Hardware Service Analysis (`hardwareService.ts`)

The current implementation is a Node.js wrapper around external CLI tools.

*   **Dependency Chain:**
    *   Node.js (Backend) -> `serialport` (Native Module) -> `mpremote` (Python CLI) -> Hardware.
*   **Current Flashing Strategy:**
    *   Uses `mpremote connect <port> cp <files> ...` to sync Python files.
    *   Uses `python -m py_compile` for syntax checking.
    *   **Major Bottleneck:** Requires the end-user to have Python and `mpremote` installed and available in their system PATH. This defeats the purpose of a self-contained "One Click" desktop app.

## 2. Electron Impact & Opportunities

Does the move to Electron simplify USB/Serial access? **Yes, but requires architectural changes.**

### The "Native Module" Trap
The current code uses `serialport`, a native Node.js module. In Electron, this requires:
1.  Recompiling `serialport` for the specific Electron version (`electron-rebuild`).
2.  Handling complex packing/signing issues.

### The Opportunity: Web Serial API
Electron supports the [Web Serial API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API) out of the box.

*   **Proposal:** Refactor `HardwareService` to use Web Serial (available in Electron Renderer or Main via generic bindings) instead of the `serialport` node module.
*   **Benefit:** Zero native dependencies. No compilation errors on Windows/Mac updates.

### The Opportunity: Bundled Flashing
Instead of shelling out to `mpremote` (which requires Python), we should integrate a pure JavaScript MicroPython interaction library.
*   **Libraries to investigate:** `micropython-ctl` or adapting code from the [WebREPL](https://github.com/micropython/webrepl) project.
*   **Feasibility:** High. This allows the Electron app to be completely self-contained (no external Python requirement).

## 3. Device Detection (`KNOWN_BOARDS`)

The current list is too restrictive:
```typescript
['10C4:EA60', 'Heltec WiFi LoRa 32 V3 (CP210x)'],
['303A:1001', 'ESP32-S3 Native USB'],
['1A86:55D4', 'ESP32 (CH9102)'],
```

**Recommendation:**
1.  **Expand List:** Add common generic driver IDs (e.g., CP2102, CH340) which cover 90% of cheap ESP32 boards.
2.  **Heuristic Detection:** Instead of exact VID:PID matching, list all COM ports and attempt a handshake (send `Ctrl-C` to interrupt, look for `>>>` MicroPython prompt) to confirm the device is a MicroPython board.

## 4. MicroPython Integration (`elisa_hardware.py`)

The hardware library is solid but relies on `sx1262`.
*   **Issue:** The `sx1262` driver is not standard in generic MicroPython firmware.
*   **Fix:** The `HardwareService` needs a "Bootstrap" function. When connecting to a new board, it should first upload the `sx1262.py` driver file automatically before trying to run user code. Currently, it only uploads files from the work directory.

## 5. Next Steps

1.  **POC:** Create a small script using `navigator.serial` (Web Serial) in the Electron frontend to prove we can read the MicroPython REPL without `serialport`.
2.  **Refactor:** Rewrite `flash` method to write files directly over Serial (REPL raw paste mode) instead of spawning `mpremote`.
3.  **Bootstrap:** Add `sx1262.py` to the bundled assets and inject it during the first flash.

**Verdict:** Proceed with Electron, but **abandon** `serialport` and `mpremote` in favor of a pure-JS Serial implementation. This will significantly lower the barrier to entry for users.
