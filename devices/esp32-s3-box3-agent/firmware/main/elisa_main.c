/**
 * @file elisa_main.c
 * @brief Main application entry point for Elisa agent on ESP32-S3-BOX-3.
 *
 * Boots the device, initializes peripherals using chatgpt_demo's existing
 * drivers, and bridges into the Elisa runtime API. The chatgpt_demo's
 * sr_handler_task handles wake word -> record -> call start_openai() -> play.
 * We provide our own start_openai() that calls the Elisa runtime instead.
 *
 * DEPENDENCIES (from esp-box BSP + chatgpt_demo):
 * - bsp/esp-box-3       -- Board support package
 * - esp_sr              -- Speech recognition (wake word)
 * - audio_player        -- Audio playback
 * - app_sr / app_audio  -- chatgpt_demo's audio pipeline
 * - settings            -- chatgpt_demo's sys_param for WiFi bridge
 */

#include <stdio.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "esp_spiffs.h"

/* BSP includes */
#include "bsp/esp-bsp.h"
#include "bsp_board.h"

/* chatgpt_demo reused components */
#include "settings.h"
#include "app_wifi.h"
#include "app_sr.h"
#include "app_audio.h"
#include "audio_player.h"

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
static void elisa_audio_play_finish_cb(void);

// ── Pending Audio Response ──────────────────────────────────────────────

/**
 * File-static storage for the current turn's audio response.
 * Must outlive the audio_player_play() call (async playback).
 * Freed in elisa_audio_play_finish_cb() when playback completes.
 */
static elisa_turn_response_t s_pending_audio_response;

// ── Boot Sequence ───────────────────────────────────────────────────────

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
        while (1) { vTaskDelay(pdMS_TO_TICKS(1000)); }
    }

    const elisa_runtime_config_t *config = elisa_get_config();
    ESP_LOGI(TAG, "Agent: %s (%s)", config->agent_name, config->agent_id);

    /* Step 4: Initialize display + face renderer.
     * Use chatgpt_demo's display init pattern with DMA buffer config.
     * Skip ui_ctrl_init() -- Elisa uses elisa_face instead. */
    bsp_display_cfg_t cfg = {
        .lvgl_port_cfg = ESP_LVGL_PORT_INIT_CONFIG(),
        .buffer_size = BSP_LCD_H_RES * CONFIG_BSP_LCD_DRAW_BUF_HEIGHT,
        .double_buffer = 0,
        .flags = {
            .buff_dma = true,
        },
    };
    bsp_display_start_with_config(&cfg);
    bsp_board_init();
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
    init_audio();
    init_wake_word(config->wake_word);

    elisa_face_set_state(FACE_STATE_IDLE);
    ESP_LOGI(TAG, "Ready! Say \"%s\" to start.", config->wake_word);

    /* Step 8: Enter main conversation loop.
     * Actual conversation is driven by sr_handler_task calling start_openai().
     * This loop is just a periodic heartbeat logger. */
    conversation_loop();
}

// ── Initialization Functions ────────────────────────────────────────────

static void init_nvs(void) {
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);
    ESP_LOGI(TAG, "NVS initialized");
}

static void init_spiffs(void) {
    esp_vfs_spiffs_conf_t conf = {
        .base_path = "/spiffs",
        .partition_label = NULL,
        .max_files = 5,
        .format_if_mount_failed = false,
    };
    ESP_ERROR_CHECK(esp_vfs_spiffs_register(&conf));
    ESP_LOGI(TAG, "SPIFFS mounted");
}

static void init_wifi(const char *ssid, const char *password) {
    ESP_LOGI(TAG, "WiFi connecting to %s...", ssid);

    /* Bridge: write our credentials into chatgpt_demo's sys_param struct
     * so app_network_start() picks them up via the existing WiFi stack.
     * This reuses the entire chatgpt_demo WiFi init (including the
     * wifi_connected flag that app_audio.c checks). */
    sys_param_t *param = settings_get_parameter();
    strncpy(param->ssid, ssid, sizeof(param->ssid) - 1);
    strncpy(param->password, password, sizeof(param->password) - 1);

    app_network_start();

    /* Poll for connection (up to 15s) */
    for (int i = 0; i < 150; i++) {
        if (WIFI_STATUS_CONNECTED_OK == wifi_connected_already()) {
            ESP_LOGI(TAG, "WiFi connected");
            return;
        }
        vTaskDelay(pdMS_TO_TICKS(100));
    }
    ESP_LOGW(TAG, "WiFi connection timeout -- will retry");
}

static void init_audio(void) {
    bsp_i2c_init();
    audio_record_init();
    ESP_LOGI(TAG, "Audio hardware initialized");
}

static void init_wake_word(const char *wake_word) {
    app_sr_start(false);
    audio_register_play_finish_cb(elisa_audio_play_finish_cb);
    ESP_LOGI(TAG, "Wake word engine initialized: %s", wake_word);
    (void)wake_word; /* Display-only; actual wake word is from SR model in flash */
}

// ── start_openai() -- Replaces chatgpt_demo's Original ─────────────────
//
// Called by sr_handler_task in app_audio.c after wake word detection and
// audio recording. The original sends audio to OpenAI (3 API calls: STT,
// ChatGPT, TTS). We send it to the Elisa runtime (1 API call).

esp_err_t start_openai(uint8_t *audio, int audio_len) {
    ESP_LOGI(TAG, "Sending WAV (%d bytes) to runtime", audio_len);

    elisa_face_set_state(FACE_STATE_THINKING);

    /* Calculate actual WAV size from header.
     * audio_record_stop() writes a standard WAV header at the start of
     * the buffer. The Subchunk2Size field at byte offset 40 gives the
     * actual audio data length. Total WAV = 44 (header) + Subchunk2Size. */
    int wav_len = audio_len;
    if (audio_len >= 44) {
        uint32_t subchunk2_size;
        memcpy(&subchunk2_size, audio + 40, sizeof(uint32_t));
        int computed = 44 + (int)subchunk2_size;
        if (computed > 0 && computed <= audio_len) {
            wav_len = computed;
        }
    }

    elisa_turn_response_t response;
    int ret = elisa_api_audio_turn(audio, (size_t)wav_len, &response);

    if (ret == 0 && response.audio_data != NULL) {
        ESP_LOGI(TAG, "Response: %s", response.text ? response.text : "(no text)");
        ESP_LOGI(TAG, "Decoded %zu bytes of MP3", response.audio_len);

        elisa_face_set_state(FACE_STATE_SPEAKING);

        /* Store response in file-static -- the buffer must outlive
         * audio_player_play() since playback is async. Freed in
         * elisa_audio_play_finish_cb() when playback completes. */
        s_pending_audio_response = response;

        FILE *fp = fmemopen(s_pending_audio_response.audio_data,
                            s_pending_audio_response.audio_len, "rb");
        if (fp != NULL) {
            audio_player_play(fp);
        } else {
            ESP_LOGE(TAG, "fmemopen failed");
            elisa_face_set_state(FACE_STATE_ERROR);
            vTaskDelay(pdMS_TO_TICKS(2000));
            elisa_face_set_state(FACE_STATE_IDLE);
            elisa_api_free_response(&s_pending_audio_response);
        }
    } else {
        ESP_LOGE(TAG, "Audio turn failed (status=%d)", response.status_code);
        elisa_face_set_state(FACE_STATE_ERROR);
        vTaskDelay(pdMS_TO_TICKS(2000));
        elisa_face_set_state(FACE_STATE_IDLE);
        elisa_api_free_response(&response);
        return ESP_FAIL;
    }

    return ESP_OK;
}

// ── Playback Complete Callback ──────────────────────────────────────────

static void elisa_audio_play_finish_cb(void) {
    elisa_face_set_state(FACE_STATE_IDLE);
    elisa_api_free_response(&s_pending_audio_response);
}

// ── Main Conversation Loop ──────────────────────────────────────────────
//
// The actual conversation is driven by sr_handler_task (from chatgpt_demo's
// app_audio.c) which calls start_openai(). This loop just logs heartbeats.

static void conversation_loop(void) {
    ESP_LOGI(TAG, "Entering conversation loop (audio pipeline active)");

    while (1) {
        ESP_LOGD(TAG, "Heartbeat -- face state: %d", elisa_face_get_state());
        vTaskDelay(pdMS_TO_TICKS(10000));
    }
}
