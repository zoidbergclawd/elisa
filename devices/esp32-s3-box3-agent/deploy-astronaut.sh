#!/usr/bin/env bash
#
# Deploy the "Cosmo" Astronaut AI to an ESP32-S3-BOX-3 in direct API mode.
#
# This script generates a SPIFFS image containing a runtime_config.json
# with direct API keys (OpenAI + Anthropic), then flashes all 6 partitions
# to the device via esptool. No Elisa runtime/laptop required after flash.
#
# Prerequisites:
#   - esptool installed (pip install esptool)
#   - python3 with spiffsgen.py (from ESP-IDF) or pip install spiffsgen
#   - OPENAI_API_KEY env var set
#   - ANTHROPIC_API_KEY env var set
#   - ESP32-S3-BOX-3 connected via USB-C
#
# Usage:
#   cd devices/esp32-s3-box3-agent
#   ./deploy-astronaut.sh [--port COM10] [--baud 460800] [--monitor]
#
# Options:
#   --port PORT     Serial port (default: auto-detect or COM10 on Windows)
#   --baud RATE     Flash baud rate (default: 460800)
#   --monitor       Open serial monitor after flash
#   --skip-flash    Only generate SPIFFS, don't flash (for debugging)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIRMWARE_DIR="${SCRIPT_DIR}/firmware"
PARTITIONS_DIR="${FIRMWARE_DIR}/partitions"

# ── Defaults ─────────────────────────────────────────────────────────────

PORT=""
BAUD=460800
MONITOR=false
SKIP_FLASH=false
CHIP="esp32s3"
FLASH_MODE="dio"
FLASH_SIZE="16MB"
FLASH_FREQ="80m"

# SPIFFS partition config (from device.json)
SPIFFS_OFFSET="0x900000"
SPIFFS_SIZE="0x200000"
SPIFFS_PAGE_SIZE=256
SPIFFS_OBJ_NAME_LEN=32
SPIFFS_META_LEN=4

# ── Parse Arguments ──────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
    case "$1" in
        --port)   PORT="$2"; shift 2 ;;
        --baud)   BAUD="$2"; shift 2 ;;
        --monitor) MONITOR=true; shift ;;
        --skip-flash) SKIP_FLASH=true; shift ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

echo "=== Astronaut AI Deploy (Cosmo) ==="
echo ""

# ── Step 1: Check Prerequisites ─────────────────────────────────────────

echo "Checking prerequisites..."

# Check API keys
if [ -z "${OPENAI_API_KEY:-}" ]; then
    echo "ERROR: OPENAI_API_KEY not set. Required for Whisper STT + TTS."
    echo "  export OPENAI_API_KEY=sk-..."
    exit 1
fi

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
    echo "ERROR: ANTHROPIC_API_KEY not set. Required for Claude chat."
    echo "  export ANTHROPIC_API_KEY=sk-ant-..."
    exit 1
fi

echo "  API keys: OK"

# Find esptool
ESPTOOL=""
if command -v esptool.py &>/dev/null; then
    ESPTOOL="esptool.py"
elif command -v esptool &>/dev/null; then
    ESPTOOL="esptool"
elif python3 -m esptool version &>/dev/null 2>&1; then
    ESPTOOL="python3 -m esptool"
elif python -m esptool version &>/dev/null 2>&1; then
    ESPTOOL="python -m esptool"
else
    echo "ERROR: esptool not found. Install with:"
    echo "  pip install esptool"
    exit 1
fi
echo "  esptool: $ESPTOOL"

# Find spiffsgen.py
SPIFFSGEN=""
find_spiffsgen() {
    # Check IDF_PATH
    if [ -n "${IDF_PATH:-}" ]; then
        local candidate="${IDF_PATH}/components/spiffs/spiffsgen.py"
        if [ -f "$candidate" ]; then
            SPIFFSGEN="$candidate"
            return 0
        fi
    fi

    # Check common install locations
    local home="${HOME:-${USERPROFILE:-}}"
    for candidate in \
        "${home}/esp/esp-idf/components/spiffs/spiffsgen.py" \
        "${home}/esp/spiffsgen.py" \
        "/opt/esp-idf/components/spiffs/spiffsgen.py"; do
        if [ -f "$candidate" ]; then
            SPIFFSGEN="$candidate"
            return 0
        fi
    done

    # Try as Python module
    if python3 -c "import spiffsgen" &>/dev/null 2>&1; then
        SPIFFSGEN="-m spiffsgen"
        return 0
    fi
    if python -c "import spiffsgen" &>/dev/null 2>&1; then
        SPIFFSGEN="-m spiffsgen"
        return 0
    fi

    return 1
}

if find_spiffsgen; then
    echo "  spiffsgen: $SPIFFSGEN"
else
    echo "ERROR: spiffsgen.py not found. Install ESP-IDF or:"
    echo "  pip install spiffsgen"
    exit 1
fi

# Check firmware files exist
REQUIRED_FILES=(
    "${FIRMWARE_DIR}/box3-agent.bin"
    "${PARTITIONS_DIR}/bootloader.bin"
    "${PARTITIONS_DIR}/partition-table.bin"
    "${PARTITIONS_DIR}/ota_data_initial.bin"
    "${PARTITIONS_DIR}/srmodels.bin"
)

for f in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$f" ]; then
        echo "ERROR: Missing firmware file: $f"
        echo ""
        echo "Run build-firmware.sh first to compile the firmware,"
        echo "or ensure pre-built binaries are in firmware/partitions/"
        exit 1
    fi
done
echo "  firmware: OK ($(du -h "${FIRMWARE_DIR}/box3-agent.bin" | cut -f1))"

# Auto-detect port if not specified
if [ -z "$PORT" ]; then
    # On Windows (MSYS/Git Bash), default to COM10
    if [[ "$(uname -s)" == MINGW* ]] || [[ "$(uname -s)" == MSYS* ]] || [[ "$(uname -s)" == CYGWIN* ]]; then
        PORT="COM10"
    else
        # Try to auto-detect on Linux/macOS
        PORT=$(ls /dev/ttyUSB* /dev/ttyACM* /dev/cu.usbmodem* 2>/dev/null | head -1 || true)
        if [ -z "$PORT" ]; then
            echo "ERROR: No serial port found. Connect BOX-3 via USB-C and use --port"
            exit 1
        fi
    fi
fi
echo "  port: $PORT"
echo ""

# ── Step 2: Generate Astronaut Config ────────────────────────────────────

echo "Generating astronaut runtime_config.json..."

TEMP_DIR=$(mktemp -d)
SPIFFS_SOURCE_DIR="${TEMP_DIR}/spiffs"
mkdir -p "$SPIFFS_SOURCE_DIR"

cat > "${SPIFFS_SOURCE_DIR}/runtime_config.json" <<JSONEOF
{
  "wifi_ssid": "Connecting...-Guest",
  "wifi_password": "Password123",
  "agent_name": "Cosmo",
  "wake_word": "Hi Elisa",
  "display_theme": "space",
  "openai_api_key": "${OPENAI_API_KEY}",
  "anthropic_api_key": "${ANTHROPIC_API_KEY}",
  "system_prompt": "You are Cosmo, an astronaut AI assistant aboard the International Space Station. You speak like a calm, knowledgeable astronaut. Keep responses to 1-2 sentences. Share space facts when relevant.",
  "tts_voice": "onyx",
  "face_descriptor": {
    "base_shape": "round",
    "eyes": { "style": "pixels", "size": "large", "color": "#00bfff" },
    "mouth": { "style": "line" },
    "expression": "cool",
    "colors": { "face": "#1a1a2e", "accent": "#16213e" }
  }
}
JSONEOF

echo "  Config written to ${SPIFFS_SOURCE_DIR}/runtime_config.json"

# ── Step 3: Generate SPIFFS Image ────────────────────────────────────────

echo "Generating SPIFFS image..."

SPIFFS_IMAGE="${TEMP_DIR}/storage.bin"

# Determine python command
PYTHON_CMD="python3"
if ! command -v python3 &>/dev/null; then
    PYTHON_CMD="python"
fi

if [[ "$SPIFFSGEN" == "-m spiffsgen" ]]; then
    $PYTHON_CMD -m spiffsgen \
        "$SPIFFS_SIZE" \
        "$SPIFFS_SOURCE_DIR" \
        "$SPIFFS_IMAGE" \
        --page-size "$SPIFFS_PAGE_SIZE" \
        --obj-name-len "$SPIFFS_OBJ_NAME_LEN" \
        --meta-len "$SPIFFS_META_LEN" \
        --use-magic \
        --use-magic-len
else
    $PYTHON_CMD "$SPIFFSGEN" \
        "$SPIFFS_SIZE" \
        "$SPIFFS_SOURCE_DIR" \
        "$SPIFFS_IMAGE" \
        --page-size "$SPIFFS_PAGE_SIZE" \
        --obj-name-len "$SPIFFS_OBJ_NAME_LEN" \
        --meta-len "$SPIFFS_META_LEN" \
        --use-magic \
        --use-magic-len
fi

echo "  SPIFFS image: $(du -h "$SPIFFS_IMAGE" | cut -f1)"

if $SKIP_FLASH; then
    echo ""
    echo "SPIFFS image at: $SPIFFS_IMAGE"
    echo "Config at: ${SPIFFS_SOURCE_DIR}/runtime_config.json"
    echo "(--skip-flash: not flashing)"
    exit 0
fi

# ── Step 4: Flash All Partitions ─────────────────────────────────────────

echo ""
echo "Flashing to ${PORT} at ${BAUD} baud..."
echo ""
echo "  0x000000  bootloader.bin"
echo "  0x008000  partition-table.bin"
echo "  0x00d000  ota_data_initial.bin"
echo "  0x010000  box3-agent.bin (app)"
echo "  0x900000  storage.bin (SPIFFS -- astronaut config)"
echo "  0xb00000  srmodels.bin (wake word model)"
echo ""

$ESPTOOL \
    --chip "$CHIP" \
    --port "$PORT" \
    --baud "$BAUD" \
    --before default_reset \
    --after hard_reset \
    write_flash \
    --flash_mode "$FLASH_MODE" \
    --flash_size "$FLASH_SIZE" \
    --flash_freq "$FLASH_FREQ" \
    0x0      "${PARTITIONS_DIR}/bootloader.bin" \
    0x8000   "${PARTITIONS_DIR}/partition-table.bin" \
    0xd000   "${PARTITIONS_DIR}/ota_data_initial.bin" \
    0x10000  "${FIRMWARE_DIR}/box3-agent.bin" \
    0x900000 "$SPIFFS_IMAGE" \
    0xb00000 "${PARTITIONS_DIR}/srmodels.bin"

echo ""
echo "Flash complete."

# ── Step 5: Cleanup ──────────────────────────────────────────────────────

rm -rf "$TEMP_DIR"

# ── Step 6: Serial Monitor (optional) ───────────────────────────────────

if $MONITOR; then
    echo ""
    echo "Opening serial monitor (115200 baud, Ctrl+C to exit)..."
    echo "Expected boot sequence:"
    echo "  === Elisa Agent Firmware ==="
    echo "  Config loaded: name=Cosmo wake=Hi Elisa theme=space mode=direct"
    echo "  Direct API mode -- no runtime required"
    echo "  Ready! Say \"Hi Elisa\" to start."
    echo ""

    # Try idf.py monitor first (best experience), fall back to simple serial cat
    if command -v idf.py &>/dev/null; then
        idf.py -p "$PORT" monitor --no-reset
    elif command -v screen &>/dev/null; then
        screen "$PORT" 115200
    elif command -v minicom &>/dev/null; then
        minicom -D "$PORT" -b 115200
    else
        # Bare-bones: just cat the port (Windows Git Bash compatible)
        stty -F "$PORT" 115200 raw -echo 2>/dev/null || true
        cat "$PORT"
    fi
else
    echo ""
    echo "Deploy complete. To monitor boot:"
    echo "  idf.py -p $PORT monitor --no-reset"
    echo "  # or: screen $PORT 115200"
    echo ""
    echo "Say \"Hi Elisa\" to talk to Cosmo."
fi
