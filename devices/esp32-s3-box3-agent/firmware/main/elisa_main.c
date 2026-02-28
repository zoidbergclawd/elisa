/**
 * @file elisa_main.c
 * @brief Main application entry point for Elisa agent on ESP32-S3-BOX-3.
 *
 * This file ties together all Elisa components:
 * 1. Boot: NVS, WiFi, SPIFFS initialization
 * 2. Config: Load runtime_config.json from SPIFFS
 * 3. Display: Initialize LVGL + face renderer
 * 4. Audio: Initialize I2S + ESP-SR wake word engine
 * 5. Network: Connect WiFi, verify runtime heartbeat
 * 6. Loop: Wait for wake word -> record -> send to runtime -> play TTS
 *
 * ADAPTATION NOTES (from chatgpt_demo):
 * - chatgpt_demo's app_main() in main.c does essentially the same boot
 *   sequence but with hardcoded OpenAI endpoints. We swap in our config
 *   loader and API client.
 * - The I2S, ESP-SR, and LVGL initialization from chatgpt_demo can be
 *   reused almost verbatim. The key changes are:
 *     1. Replace Kconfig WiFi with runtime_config.json WiFi creds
 *     2. Replace OpenAI HTTP calls with elisa_api_audio_turn()
 *     3. Replace static UI with elisa_face animated avatar
 *     4. Add heartbeat check on boot
 *
 * BUILD INSTRUCTIONS:
 * See firmware/README.md for how to set up the ESP-IDF toolchain and
 * build this firmware from the chatgpt_demo base.
 *
 * DEPENDENCIES (from esp-box BSP + chatgpt_demo):
 * - bsp/esp-box-3       -- Board support package (display, audio, touch)
 * - esp_sr              -- Speech recognition (wake word detection)
 * - esp_codec_dev       -- Audio codec driver (ES8311)
 * - lvgl                -- Graphics library
 * - esp_http_client     -- HTTP client
 * - cJSON               -- JSON parser
 * - esp_spiffs           -- SPIFFS filesystem
 * - nvs_flash           -- Non-volatile storage
 */

#include <stdio.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "esp_spiffs.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"

/* BSP includes (from esp-box) */
#include "bsp/esp-bsp.h"

/* Elisa components */
#include "elisa_config.h"
#include "elisa_api.h"
#include "elisa_face.h"

static const char *TAG = "elisa_main";

// ── Forward Declarations ────────────────────────────────────────────────

static void init_nvs(void);
static void init_spiffs(void);
static void init_wifi(const char *ssid, const char *password);
static void init_audio(void);
static void init_wake_word(const char *wake_word);
static void conversation_loop(void);

// ── Boot Sequence ───────────────────────────────────────────────────────

/**
 * Application entry point.
 *
 * ADAPTATION: chatgpt_demo's app_main() flow is preserved but with
 * Elisa-specific initialization inserted at each step.
 */
void app_main(void) {
    ESP_LOGI(TAG, "=== Elisa Agent Firmware ===");
    ESP_LOGI(TAG, "Booting...");

    /* Step 1: Initialize NVS (required for WiFi) */
    init_nvs();

    /* Step 2: Initialize SPIFFS (for runtime_config.json) */
    init_spiffs();

    /* Step 3: Load runtime configuration */
    if (elisa_load_config() != 0) {
        ESP_LOGE(TAG, "Failed to load runtime config -- halting");
        /* TODO: Show error on display with instructions to re-flash */
        while (1) { vTaskDelay(pdMS_TO_TICKS(1000)); }
    }

    const elisa_runtime_config_t *config = elisa_get_config();
    ESP_LOGI(TAG, "Agent: %s (%s)", config->agent_name, config->agent_id);

    /* Step 4: Initialize display + face renderer */
    /*
     * ADAPTATION: chatgpt_demo calls bsp_display_start() here.
     * We add elisa_face_init() after the BSP display is ready.
     */
    bsp_display_start();
    bsp_display_backlight_on();

    const face_descriptor_t *face = elisa_get_face_descriptor();
    elisa_face_init(face);
    elisa_face_set_state(FACE_STATE_IDLE);

    /* Step 5: Connect to WiFi */
    ESP_LOGI(TAG, "Connecting to WiFi: %s", config->wifi_ssid);
    elisa_face_set_state(FACE_STATE_THINKING); /* Show "connecting" animation */
    init_wifi(config->wifi_ssid, config->wifi_password);

    /* Step 6: Initialize API client and verify connectivity */
    elisa_api_init(config);

    elisa_heartbeat_t hb;
    if (elisa_api_heartbeat(&hb) == 0 && hb.healthy) {
        ESP_LOGI(TAG, "Runtime is reachable");
    } else {
        ESP_LOGW(TAG, "Runtime not reachable -- will retry in conversation loop");
    }

    /* Step 7: Initialize audio hardware + wake word engine */
    /*
     * ADAPTATION: chatgpt_demo's audio init (app_sr_start) is reused.
     * We pass our configured wake word instead of the hardcoded one.
     */
    init_audio();
    init_wake_word(config->wake_word);

    elisa_face_set_state(FACE_STATE_IDLE);
    ESP_LOGI(TAG, "Ready! Say \"%s\" to start.", config->wake_word);

    /* Step 8: Enter main conversation loop */
    conversation_loop();
}

// ── Initialization Stubs ────────────────────────────────────────────────
//
// These functions wrap ESP-IDF initialization APIs. The actual
// implementation will use the same patterns as chatgpt_demo but with
// values from our runtime config instead of Kconfig menuconfig.
//

static void init_nvs(void) {
    /*
     * Standard NVS init from chatgpt_demo -- no changes needed.
     *
     * esp_err_t ret = nvs_flash_init();
     * if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
     *     ESP_ERROR_CHECK(nvs_flash_erase());
     *     ret = nvs_flash_init();
     * }
     * ESP_ERROR_CHECK(ret);
     */
    ESP_LOGI(TAG, "NVS initialized");
}

static void init_spiffs(void) {
    /*
     * Mount SPIFFS partition containing runtime_config.json.
     *
     * esp_vfs_spiffs_conf_t conf = {
     *     .base_path = "/spiffs",
     *     .partition_label = NULL,
     *     .max_files = 5,
     *     .format_if_mount_failed = false,
     * };
     * ESP_ERROR_CHECK(esp_vfs_spiffs_register(&conf));
     */
    ESP_LOGI(TAG, "SPIFFS mounted");
}

static void init_wifi(const char *ssid, const char *password) {
    /*
     * ADAPTATION: chatgpt_demo reads WiFi creds from Kconfig:
     *   CONFIG_ESP_WIFI_SSID / CONFIG_ESP_WIFI_PASSWORD
     * We use ssid/password from runtime_config.json instead.
     *
     * wifi_config_t wifi_config = {
     *     .sta = {
     *         .ssid = "",      // filled from ssid param
     *         .password = "",  // filled from password param
     *     },
     * };
     * strncpy((char*)wifi_config.sta.ssid, ssid, sizeof(wifi_config.sta.ssid));
     * strncpy((char*)wifi_config.sta.password, password, sizeof(wifi_config.sta.password));
     *
     * ESP_ERROR_CHECK(esp_netif_init());
     * ESP_ERROR_CHECK(esp_event_loop_create_default());
     * esp_netif_create_default_wifi_sta();
     * wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
     * ESP_ERROR_CHECK(esp_wifi_init(&cfg));
     * ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
     * ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
     * ESP_ERROR_CHECK(esp_wifi_start());
     */
    ESP_LOGI(TAG, "WiFi connecting to %s...", ssid);
    (void)password;
}

static void init_audio(void) {
    /*
     * ADAPTATION: chatgpt_demo's audio init from app_sr_start() is
     * reused verbatim. It sets up:
     * - I2S driver for microphone (ES7210 or onboard PDM)
     * - I2S driver for speaker (ES8311 codec)
     * - Audio codec configuration
     *
     * No changes needed -- the BOX-3 BSP handles hardware specifics.
     *
     * bsp_i2s_init();  // or equivalent BSP call
     */
    ESP_LOGI(TAG, "Audio hardware initialized");
}

static void init_wake_word(const char *wake_word) {
    /*
     * ADAPTATION: chatgpt_demo initializes ESP-SR with a hardcoded
     * wake word (usually "Hi ESP"). We use the configured wake_word.
     *
     * ESP-SR wake word setup:
     * - esp_sr_wn_init() with the appropriate model
     * - Wake word must match an ESP-SR supported word or custom model
     *
     * Note: ESP-SR has a fixed set of supported wake words. Custom
     * wake words require training a model. The WAKE_WORD dropdown in
     * the Blockly block should only offer ESP-SR-compatible options.
     */
    ESP_LOGI(TAG, "Wake word engine initialized: %s", wake_word);
}

// ── Main Conversation Loop ──────────────────────────────────────────────

/**
 * Main conversation loop.
 *
 * Waits for wake word detection from ESP-SR, then:
 * 1. Set face to LISTENING state
 * 2. Record audio from I2S microphone until silence detected
 * 3. Set face to THINKING state
 * 4. Send audio to runtime via elisa_api_audio_turn()
 * 5. Set face to SPEAKING state
 * 6. Play TTS response through speaker
 * 7. Set face to IDLE state
 * 8. Repeat
 *
 * ADAPTATION: chatgpt_demo has this same loop in app_sr_handler.c
 * but calls OpenAI APIs. We call elisa_api_audio_turn() instead.
 */
static void conversation_loop(void) {
    ESP_LOGI(TAG, "Entering conversation loop");

    while (1) {
        /*
         * TODO: Implementation steps (following chatgpt_demo pattern):
         *
         * 1. Block on ESP-SR wake word event queue
         *    xQueueReceive(sr_event_queue, &sr_event, portMAX_DELAY);
         *
         * 2. On wake word detected:
         *    elisa_face_set_state(FACE_STATE_LISTENING);
         *    // Play a short "ding" acknowledgment sound
         *
         * 3. Record audio from I2S until silence (VAD):
         *    size_t audio_len = 0;
         *    uint8_t *audio_buf = record_until_silence(&audio_len);
         *
         * 4. Send to runtime:
         *    elisa_face_set_state(FACE_STATE_THINKING);
         *    elisa_turn_response_t response;
         *    int ret = elisa_api_audio_turn(audio_buf, audio_len, &response);
         *
         * 5. Play response:
         *    if (ret == 0 && response.audio_data != NULL) {
         *        elisa_face_set_state(FACE_STATE_SPEAKING);
         *        play_audio(response.audio_data, response.audio_len);
         *    } else {
         *        elisa_face_set_state(FACE_STATE_ERROR);
         *        vTaskDelay(pdMS_TO_TICKS(2000));
         *    }
         *
         * 6. Cleanup and return to idle:
         *    elisa_api_free_response(&response);
         *    free(audio_buf);
         *    elisa_face_set_state(FACE_STATE_IDLE);
         */

        /* Placeholder: sleep to prevent busy-wait */
        vTaskDelay(pdMS_TO_TICKS(100));
    }
}
