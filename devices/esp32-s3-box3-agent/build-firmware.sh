#!/usr/bin/env bash
#
# Build the ESP32-S3-BOX-3 voice agent firmware.
#
# This script clones the esp-box repository, copies the Elisa scaffold
# into the chatgpt_demo base, builds the firmware binary, and copies
# it back to the Elisa device plugin directory.
#
# Prerequisites:
#   - ESP-IDF v5.1+ installed and sourced (. $HOME/esp/esp-idf/export.sh)
#   - Python 3.8+ with pip
#   - Git
#
# Usage:
#   cd devices/esp32-s3-box3-agent
#   ./build-firmware.sh
#
# Output:
#   firmware/box3-agent.bin

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIRMWARE_DIR="${SCRIPT_DIR}/firmware"
SCAFFOLD_DIR="${FIRMWARE_DIR}/main"
BUILD_DIR="${HOME}/esp/elisa_agent"
ESP_BOX_DIR="${HOME}/esp/esp-box"

echo "=== Elisa BOX-3 Firmware Builder ==="
echo ""

# ── Step 1: Check ESP-IDF ──────────────────────────────────────────────

if ! command -v idf.py &>/dev/null; then
    echo "ERROR: idf.py not found. Please install and source ESP-IDF:"
    echo ""
    echo "  # Install (one-time):"
    echo "  mkdir -p ~/esp && cd ~/esp"
    echo "  git clone --recursive -b v5.3.2 https://github.com/espressif/esp-idf.git"
    echo "  cd esp-idf && ./install.sh esp32s3"
    echo ""
    echo "  # Source (every terminal session):"
    echo "  . ~/esp/esp-idf/export.sh"
    exit 1
fi

echo "ESP-IDF: $(idf.py --version)"

# ── Step 2: Clone esp-box if needed ────────────────────────────────────

if [ ! -d "${ESP_BOX_DIR}" ]; then
    echo ""
    echo "Cloning esp-box repository..."
    git clone --depth 1 https://github.com/espressif/esp-box.git "${ESP_BOX_DIR}"
fi

# ── Step 3: Copy chatgpt_demo as base ──────────────────────────────────

if [ ! -d "${BUILD_DIR}" ]; then
    echo ""
    echo "Setting up build directory from chatgpt_demo..."
    cp -r "${ESP_BOX_DIR}/examples/chatgpt_demo" "${BUILD_DIR}"
fi

# ── Step 4: Copy Elisa scaffold files ──────────────────────────────────

echo ""
echo "Copying Elisa scaffold files..."
cp "${SCAFFOLD_DIR}"/elisa_*.{c,h} "${BUILD_DIR}/main/"

# Add sample runtime_config.json to SPIFFS
if [ ! -f "${BUILD_DIR}/spiffs/runtime_config.json" ]; then
    cat > "${BUILD_DIR}/spiffs/runtime_config.json" <<'JSONEOF'
{
  "agent_id": "PLACEHOLDER",
  "api_key": "PLACEHOLDER",
  "runtime_url": "http://192.168.1.100:8000",
  "wifi_ssid": "YOUR_WIFI",
  "wifi_password": "YOUR_PASSWORD",
  "agent_name": "Elisa Agent",
  "wake_word": "Hi Elisa",
  "display_theme": "default"
}
JSONEOF
fi

# ── Step 4b: Rename start_openai in chatgpt_demo main.c ────────────────
# Our elisa_main.c provides a replacement start_openai() that calls the
# Elisa runtime instead of OpenAI. Rename the original so ours wins at
# link time. The sr_handler_task in app_audio.c calls start_openai() --
# it will now resolve to our version.

if ! grep -q "start_openai_original" "${BUILD_DIR}/main/main.c" 2>/dev/null; then
    echo "Patching main.c: renaming start_openai -> start_openai_original..."
    sed -i 's/start_openai/start_openai_original/g' "${BUILD_DIR}/main/main.c"
fi

# ── Step 4c: Stub app_ui_ctrl.c ────────────────────────────────────────
# chatgpt_demo's sr_handler_task calls ui_ctrl_show_panel() and
# ui_ctrl_guide_jump() on wake word detection. Since we skip ui_ctrl_init()
# (Elisa uses elisa_face.c instead), those calls would crash.
# Replace with no-op stubs.

echo "Writing app_ui_ctrl.c stub..."
cat > "${BUILD_DIR}/main/app_ui_ctrl.c" <<'STUBEOF'
/* Stub: replaces chatgpt_demo's app_ui_ctrl.c.
 * Prevents crashes from UI control calls since Elisa uses elisa_face.c
 * instead of chatgpt_demo's chat UI. */

#include <stdbool.h>

void ui_ctrl_init(void) {}
void ui_ctrl_show_panel(int panel, int timeout_ms) {
    (void)panel;
    (void)timeout_ms;
}
void ui_ctrl_label_show(void) {}
void ui_ctrl_guide_jump(void) {}
bool ui_ctrl_key_lock(void) { return false; }
void ui_ctrl_key_unlock(void) {}
STUBEOF

# ── Step 5: Patch CMakeLists.txt ───────────────────────────────────────

CMAKELISTS="${BUILD_DIR}/main/CMakeLists.txt"
if ! grep -q "elisa_config.c" "${CMAKELISTS}"; then
    echo "Patching main/CMakeLists.txt to include Elisa sources..."
    sed -i.bak 's|"main.c"|"main.c"\n        "elisa_config.c"\n        "elisa_api.c"\n        "elisa_face.c"\n        "elisa_main.c"|' "${CMAKELISTS}"
    rm -f "${CMAKELISTS}.bak"
fi

# Remove factory_nvs dependency (we use SPIFFS runtime_config.json instead)
if grep -q "factory_nvs" "${CMAKELISTS}"; then
    echo "Removing factory_nvs dependency..."
    # Replace everything from the NVS block to the spiffs line with just the spiffs line
    # Use cygpath -w on Windows to convert MSYS paths for native Python
    _CMAKE_PATH="${CMAKELISTS}"
    if command -v cygpath &>/dev/null; then
        _CMAKE_PATH="$(cygpath -w "${CMAKELISTS}")"
    fi
    python -c "
import re, sys
fpath = sys.argv[1]
with open(fpath, 'r') as f:
    content = f.read()
content = re.sub(
    r'set\(MV_UF2_BIN_EXE.*?(?=spiffs_create_partition_image)',
    '# Elisa: factory_nvs/UF2 removed -- we use SPIFFS runtime_config.json instead\n',
    content, flags=re.DOTALL)
with open(fpath, 'w') as f:
    f.write(content)
" "$_CMAKE_PATH"
fi

# Fix top-level CMakeLists.txt to point to esp-box components
TOP_CMAKE="${BUILD_DIR}/CMakeLists.txt"
if grep -q "../../components" "${TOP_CMAKE}"; then
    echo "Patching top-level CMakeLists.txt for standalone build..."
    sed -i.bak "s|../../components|\${ESP_BOX_DIR}/components|" "${TOP_CMAKE}"
    # Add ESP_BOX_DIR variable and rename project
    sed -i.bak 's|include($ENV{IDF_PATH}/tools/cmake/project.cmake)|include($ENV{IDF_PATH}/tools/cmake/project.cmake)\nset(ESP_BOX_DIR $ENV{HOME}/esp/esp-box)|' "${TOP_CMAKE}"
    sed -i.bak 's|project(chatgpt_demo)|project(elisa_agent)|' "${TOP_CMAKE}"
    rm -f "${TOP_CMAKE}.bak"
fi

# ── Step 6: Set target and build ───────────────────────────────────────

echo ""
echo "Building firmware (this takes 3-10 minutes on first build)..."
cd "${BUILD_DIR}"

# Set target if not already configured
if [ ! -f "sdkconfig" ] || ! grep -q "CONFIG_IDF_TARGET=\"esp32s3\"" sdkconfig 2>/dev/null; then
    idf.py set-target esp32s3
fi

idf.py build

# ── Step 7: Copy binary back ──────────────────────────────────────────

echo ""
BIN_FILE="${BUILD_DIR}/build/elisa_agent.bin"
if [ ! -f "${BIN_FILE}" ]; then
    # Fallback: try chatgpt_demo.bin (if project wasn't renamed)
    BIN_FILE="${BUILD_DIR}/build/chatgpt_demo.bin"
fi
if [ ! -f "${BIN_FILE}" ]; then
    # Last resort: find any app binary
    BIN_FILE=$(find "${BUILD_DIR}/build" -maxdepth 1 -name "*.bin" -not -name "bootloader.bin" -not -name "partition*" -not -name "ota*" -not -name "storage*" | head -1)
fi

if [ -f "${BIN_FILE}" ]; then
    mkdir -p "${FIRMWARE_DIR}"
    cp "${BIN_FILE}" "${FIRMWARE_DIR}/box3-agent.bin"
    # Copy companion binaries for full flash
    mkdir -p "${FIRMWARE_DIR}/partitions"
    cp -f "${BUILD_DIR}/build/bootloader/bootloader.bin" "${FIRMWARE_DIR}/partitions/" 2>/dev/null || true
    cp -f "${BUILD_DIR}/build/partition_table/partition-table.bin" "${FIRMWARE_DIR}/partitions/" 2>/dev/null || true
    cp -f "${BUILD_DIR}/build/ota_data_initial.bin" "${FIRMWARE_DIR}/partitions/" 2>/dev/null || true
    cp -f "${BUILD_DIR}/build/storage.bin" "${FIRMWARE_DIR}/partitions/" 2>/dev/null || true
    cp -f "${BUILD_DIR}/build/srmodels/srmodels.bin" "${FIRMWARE_DIR}/partitions/" 2>/dev/null || true

    echo "SUCCESS: Firmware binary at ${FIRMWARE_DIR}/box3-agent.bin"
    echo "Size: $(du -h "${FIRMWARE_DIR}/box3-agent.bin" | cut -f1)"
    echo "Companion binaries in ${FIRMWARE_DIR}/partitions/"
else
    echo "ERROR: Build succeeded but firmware binary not found"
    echo "Check ${BUILD_DIR}/build/ for .bin files"
    exit 1
fi

echo ""
echo "=== Build complete ==="
echo ""
echo "The firmware is ready for flashing via the Elisa app."
echo "The deploy pipeline will write runtime_config.json with your"
echo "agent credentials before flashing."
