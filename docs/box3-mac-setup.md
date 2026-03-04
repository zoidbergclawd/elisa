# BOX-3 Dev Setup on macOS

Notes for Claude Code to get oriented on the Mac Mini.

## ESP-IDF Toolchain

```bash
# Install ESP-IDF v5.3.2 (one-time)
mkdir -p ~/esp && cd ~/esp
git clone --recursive -b v5.3.2 https://github.com/espressif/esp-idf.git
cd esp-idf && ./install.sh esp32s3

# Source every terminal session
. ~/esp/esp-idf/export.sh

# Verify
idf.py --version
which esptool.py
which spiffsgen.py   # needed for SPIFFS partition generation
```

On macOS, `idf.py` and all Python tools work natively. No MSYS2 workarounds needed.

## Project Setup

```bash
git clone <repo> && cd elisa
git checkout feature/box3-integration
npm install
```

## Run Backend for BOX-3

```bash
# Must bind to 0.0.0.0 so BOX-3 can reach it over LAN
HOST=0.0.0.0 ANTHROPIC_API_KEY=<key> OPENAI_API_KEY=<key> npm run dev --prefix backend
```

The BOX-3 needs the Mac's LAN IP (not localhost) as `runtime_url`. Find it with `ipconfig getifaddr en0`.

## Rebuild Firmware

```bash
# Source ESP-IDF first
. ~/esp/esp-idf/export.sh

cd devices/esp32-s3-box3-agent
./build-firmware.sh
```

Output: `firmware/box3-agent.bin` + partition binaries in `firmware/partitions/`.

The build script clones `esp-box` to `~/esp/esp-box`, copies `chatgpt_demo` as the base, patches in Elisa sources, and builds. First build takes 3-10 minutes. Incremental rebuilds are fast.

## Flash to Device

Connect BOX-3 via USB-C. macOS serial port will be `/dev/cu.usbmodem*` or `/dev/cu.usbserial*`.

The Elisa app handles flashing via `EsptoolFlashStrategy` during deploy. For manual flash:

```bash
esptool.py --chip esp32s3 --port /dev/cu.usbmodem* --baud 460800 write_flash \
  0x0      firmware/partitions/bootloader.bin \
  0x8000   firmware/partitions/partition-table.bin \
  0xd000   firmware/partitions/ota_data_initial.bin \
  0xb00000 firmware/partitions/srmodels.bin \
  0x900000 firmware/partitions/storage.bin \
  0x10000  firmware/box3-agent.bin
```

Monitor serial output: `idf.py -p /dev/cu.usbmodem* monitor` (or `screen /dev/cu.usbmodem* 115200`).

## Current State (as of March 2026)

### What works
- Pre-built firmware binary with ESP-SR wake word + runtime audio pipeline
- Backend audio pipeline: Whisper STT -> Claude -> OpenAI TTS
- Opus compression added to backend + firmware source (not yet in pre-built binary)
- Custom "Hi Roo" wake word TFLite model (60KB, prob=0.941) -- source done, not in pre-built binary
- Agent provisioning, SPIFFS config generation, esptool flash strategy

### Open issues to tackle
- **#167** -- runtime_url returns localhost instead of LAN IP (blocker for deploy)
- **#168** -- rebuild firmware binary with Opus support
- **#169** -- SPIFFS generation fails without ESP-IDF (need fallback or bundle spiffsgen.py)
- **#166** -- wake word detection reliability improvements

### Priority order
1. #167 (LAN IP) -- unblocks end-to-end deploy
2. #169 (spiffsgen) -- unblocks deploy on machines without full ESP-IDF
3. #168 (firmware rebuild) -- get Opus compression into the binary
4. #166 (wake word) -- quality improvement, not a blocker

## Key Files

| Area | File |
|------|------|
| Firmware entry point | `devices/esp32-s3-box3-agent/firmware/main/elisa_main.c` |
| API client (HTTP to backend) | `devices/esp32-s3-box3-agent/firmware/main/elisa_api.c` |
| Opus decoder | `devices/esp32-s3-box3-agent/firmware/main/elisa_opus.c` |
| Runtime config loader | `devices/esp32-s3-box3-agent/firmware/main/elisa_config.c` |
| Face renderer (LVGL) | `devices/esp32-s3-box3-agent/firmware/main/elisa_face.c` |
| Build script | `devices/esp32-s3-box3-agent/build-firmware.sh` |
| Device manifest | `devices/esp32-s3-box3-agent/device.json` |
| Backend audio pipeline | `backend/src/services/runtime/audioPipeline.ts` |
| Backend audio route | `backend/src/routes/runtime.ts` (POST /v1/agents/:id/turn/audio) |
| Flash strategy | `backend/src/services/flashStrategy.ts` |
| Runtime provisioner | `backend/src/services/runtimeProvisioner.ts` |
| Deploy phase | `backend/src/services/phases/deployPhase.ts` |
