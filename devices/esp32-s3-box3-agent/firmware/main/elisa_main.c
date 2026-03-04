/**
 * @file elisa_main.c
 * @brief Main application entry point for Elisa agent on ESP32-S3-BOX-3.
 *
 * Boots the device, initializes peripherals using chatgpt_demo's existing
 * drivers, and bridges into the AI pipeline. Supports two modes:
 *
 * 1. Direct API mode (POC): Calls OpenAI Whisper STT + Claude Messages API +
 *    OpenAI TTS directly from the device. No laptop/runtime required.
 *    Activated when openai_api_key and anthropic_api_key are present in config.
 *
 * 2. Runtime mode: Routes all AI calls through the Elisa backend runtime
 *    (POST /v1/agents/:id/turn/audio). Requires laptop running the backend.
 *    Activated when agent_id, api_key, and runtime_url are present.
 *
 * The chatgpt_demo's sr_handler_task handles wake word -> record ->
 * call start_openai() -> play. We provide our own start_openai().
 *
 * DEPENDENCIES (from esp-box BSP + chatgpt_demo):
 * - bsp/esp-box-3       -- Board support package
 * - esp_sr              -- Speech recognition (wake word)
 * - audio_player        -- Audio playback
 * - app_sr / app_audio  -- chatgpt_demo's audio pipeline
 * - settings            -- chatgpt_demo's sys_param for WiFi bridge
 * - espressif__openai   -- OpenAI API wrapper (Whisper STT + TTS)
 */

#include <stdio.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_heap_caps.h"
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

/* OpenAI component (from chatgpt_demo managed components) */
#include "OpenAI.h"

/* Elisa components */
#include "elisa_config.h"
#include "elisa_api.h"
#include "elisa_face.h"
#include "elisa_opus.h"

static const char *TAG = "elisa_main";

// ── Forward Declarations ────────────────────────────────────────────────

static void init_nvs(void);
static void init_spiffs(void);
static void init_wifi(const char *ssid, const char *password);
static void init_audio(void);
static void init_wake_word(const char *wake_word);
static void conversation_loop(void);
static void elisa_audio_play_finish_cb(void);
static esp_err_t start_openai_direct(uint8_t *audio, int wav_len);
static esp_err_t start_openai_runtime(uint8_t *audio, int wav_len);

// ── Mode Flag ───────────────────────────────────────────────────────────

/** True when running in direct API mode (no runtime required). */
static bool s_direct_mode = false;

// ── Direct Mode State ───────────────────────────────────────────────────

/** OpenAI handle for Whisper STT and TTS (direct mode only). */
static OpenAI_t *s_openai = NULL;
static OpenAI_AudioTranscription_t *s_stt = NULL;
static OpenAI_AudioSpeech_t *s_tts = NULL;

// ── Pending Audio Response (runtime mode) ───────────────────────────────

/**
 * File-static storage for the current turn's audio response (runtime mode).
 * Must outlive the audio_player_play() call (async playback).
 * Freed in elisa_audio_play_finish_cb() when playback completes.
 */
static elisa_turn_response_t s_pending_audio_response;

// ── Pending Direct Mode Audio ───────────────────────────────────────────

/** TTS audio data that must outlive async playback (direct mode). */
static uint8_t *s_pending_tts_data = NULL;
static size_t s_pending_tts_len = 0;
/** Claude response text pending free (direct mode). */
static char *s_pending_response_text = NULL;

/** Decoded Opus PCM data wrapped in WAV (runtime mode, Opus path). */
static uint8_t *s_pending_opus_wav = NULL;
static size_t s_pending_opus_wav_len = 0;

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
    ESP_LOGI(TAG, "Agent: %s", config->agent_name);

    /* Determine mode */
    s_direct_mode = (strlen(config->openai_api_key) > 0 && strlen(config->anthropic_api_key) > 0);

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

    /* Step 6: Initialize API clients based on mode */
    if (s_direct_mode) {
        ESP_LOGI(TAG, "Direct API mode -- no runtime required");

        /* Initialize OpenAI handle for Whisper STT + TTS */
        s_openai = OpenAICreate(config->openai_api_key);
        s_stt = s_openai->audioTranscriptionCreate(s_openai);
        s_stt->setResponseFormat(s_stt, OPENAI_AUDIO_RESPONSE_FORMAT_TEXT);

        s_tts = s_openai->audioSpeechCreate(s_openai);
        s_tts->setModel(s_tts, "tts-1");
        s_tts->setVoice(s_tts, config->tts_voice);
        s_tts->setResponseFormat(s_tts, OPENAI_AUDIO_OUTPUT_FORMAT_MP3);
        s_tts->setSpeed(s_tts, 1.0);

        /* Initialize Claude API */
        elisa_claude_init(config->anthropic_api_key, config->system_prompt);
    } else {
        ESP_LOGI(TAG, "Runtime mode -- connecting to %s", config->runtime_url);
        elisa_api_init(config);

        elisa_heartbeat_t hb;
        if (elisa_api_heartbeat(&hb) == 0 && hb.healthy) {
            ESP_LOGI(TAG, "Runtime is reachable");
        } else {
            ESP_LOGW(TAG, "Runtime not reachable -- will retry in conversation loop");
        }
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

// ── PCM to WAV Helper ───────────────────────────────────────────────────

/**
 * Wrap raw PCM int16 samples in a WAV header for audio_player_play().
 * Allocates a new buffer (WAV header + PCM data) in PSRAM.
 *
 * @param pcm_data    PCM int16 samples
 * @param pcm_samples Number of samples
 * @param sample_rate Sample rate (e.g. 48000)
 * @param wav_out     Output: pointer to WAV data (caller frees)
 * @param wav_len     Output: total WAV length in bytes
 * @return 0 on success, -1 on error
 */
static int pcm_to_wav(const int16_t *pcm_data, size_t pcm_samples,
                      uint32_t sample_rate, uint8_t **wav_out, size_t *wav_len) {
    const uint16_t channels = 1;
    const uint16_t bits_per_sample = 16;
    const uint32_t data_size = (uint32_t)(pcm_samples * sizeof(int16_t));
    const uint32_t fmt_chunk_size = 16;
    const uint32_t file_size = 36 + data_size; /* RIFF header size - 8 + data */
    const size_t total = 44 + data_size;

    uint8_t *buf = (uint8_t *)heap_caps_malloc(total, MALLOC_CAP_SPIRAM);
    if (buf == NULL) return -1;

    /* RIFF header */
    memcpy(buf + 0,  "RIFF", 4);
    memcpy(buf + 4,  &file_size, 4);
    memcpy(buf + 8,  "WAVE", 4);

    /* fmt chunk */
    memcpy(buf + 12, "fmt ", 4);
    memcpy(buf + 16, &fmt_chunk_size, 4);
    uint16_t audio_fmt = 1; /* PCM */
    memcpy(buf + 20, &audio_fmt, 2);
    memcpy(buf + 22, &channels, 2);
    memcpy(buf + 24, &sample_rate, 4);
    uint32_t byte_rate = sample_rate * channels * bits_per_sample / 8;
    memcpy(buf + 28, &byte_rate, 4);
    uint16_t block_align = channels * bits_per_sample / 8;
    memcpy(buf + 32, &block_align, 2);
    memcpy(buf + 34, &bits_per_sample, 2);

    /* data chunk */
    memcpy(buf + 36, "data", 4);
    memcpy(buf + 40, &data_size, 4);
    memcpy(buf + 44, pcm_data, data_size);

    *wav_out = buf;
    *wav_len = total;
    return 0;
}

// ── start_openai() -- Replaces chatgpt_demo's Original ─────────────────
//
// Called by sr_handler_task in app_audio.c after wake word detection and
// audio recording. Dispatches to direct API mode or runtime mode.

esp_err_t start_openai(uint8_t *audio, int audio_len) {
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

    if (s_direct_mode) {
        return start_openai_direct(audio, wav_len);
    } else {
        return start_openai_runtime(audio, wav_len);
    }
}

// ── Direct API Mode ─────────────────────────────────────────────────────
//
// Three direct API calls: OpenAI Whisper STT -> Claude -> OpenAI TTS.
// No runtime/laptop required.

static esp_err_t start_openai_direct(uint8_t *audio, int wav_len) {
    ESP_LOGI(TAG, "[Direct] Processing WAV (%d bytes)", wav_len);

    /* Step 1: Whisper STT */
    elisa_face_set_state(FACE_STATE_THINKING);

    char *transcript = s_stt->file(s_stt, audio, wav_len, OPENAI_AUDIO_INPUT_FORMAT_WAV);
    if (transcript == NULL || strlen(transcript) == 0) {
        ESP_LOGE(TAG, "[Direct] Whisper STT failed or empty transcript");
        elisa_face_set_state(FACE_STATE_ERROR);
        vTaskDelay(pdMS_TO_TICKS(2000));
        elisa_face_set_state(FACE_STATE_IDLE);
        if (transcript) free(transcript);
        return ESP_FAIL;
    }
    ESP_LOGI(TAG, "[Direct] Whisper: %s", transcript);

    /* Step 2: Claude Messages API */
    char *response_text = NULL;
    int ret = elisa_claude_chat(transcript, &response_text);
    free(transcript);

    if (ret != 0 || response_text == NULL) {
        ESP_LOGE(TAG, "[Direct] Claude chat failed");
        elisa_face_set_state(FACE_STATE_ERROR);
        vTaskDelay(pdMS_TO_TICKS(2000));
        elisa_face_set_state(FACE_STATE_IDLE);
        if (response_text) free(response_text);
        return ESP_FAIL;
    }
    ESP_LOGI(TAG, "[Direct] Claude: %s", response_text);

    /* Step 3: OpenAI TTS */
    elisa_face_set_state(FACE_STATE_SPEAKING);

    OpenAI_SpeechResponse_t *speech = s_tts->speech(s_tts, response_text);
    if (speech == NULL || speech->getData(speech) == NULL || speech->getLen(speech) == 0) {
        ESP_LOGE(TAG, "[Direct] TTS failed");
        free(response_text);
        if (speech) speech->deleteResponse(speech);
        elisa_face_set_state(FACE_STATE_ERROR);
        vTaskDelay(pdMS_TO_TICKS(2000));
        elisa_face_set_state(FACE_STATE_IDLE);
        return ESP_FAIL;
    }
    ESP_LOGI(TAG, "[Direct] TTS: %lu bytes MP3", (unsigned long)speech->getLen(speech));

    /* Store data in file-statics (must outlive async playback).
     * Freed in elisa_audio_play_finish_cb(). */
    uint32_t tts_len = speech->getLen(speech);
    char *tts_data = speech->getData(speech);
    s_pending_tts_data = (uint8_t *)tts_data;
    s_pending_tts_len = tts_len;
    s_pending_response_text = response_text;

    FILE *fp = fmemopen(s_pending_tts_data, s_pending_tts_len, "rb");
    if (fp != NULL) {
        audio_player_play(fp);
    } else {
        ESP_LOGE(TAG, "fmemopen failed");
        elisa_face_set_state(FACE_STATE_ERROR);
        vTaskDelay(pdMS_TO_TICKS(2000));
        elisa_face_set_state(FACE_STATE_IDLE);
        free(s_pending_tts_data);
        s_pending_tts_data = NULL;
        free(s_pending_response_text);
        s_pending_response_text = NULL;
    }
    /* Note: don't call speech->deleteResponse() here — the data pointer
     * is used by audio_player_play() asynchronously. It's freed in the
     * playback finish callback via s_pending_tts_data. */

    return ESP_OK;
}

// ── Runtime Mode ────────────────────────────────────────────────────────
//
// Single API call to Elisa runtime (POST /v1/agents/:id/turn/audio).

static esp_err_t start_openai_runtime(uint8_t *audio, int wav_len) {
    ESP_LOGI(TAG, "[Runtime] Sending WAV (%d bytes) to runtime", wav_len);

    elisa_face_set_state(FACE_STATE_THINKING);

    elisa_turn_response_t response;
    int ret = elisa_api_audio_turn(audio, (size_t)wav_len, &response);

    if (ret == 0 && response.audio_data != NULL) {
        ESP_LOGI(TAG, "Response: %s", response.text ? response.text : "(no text)");
        ESP_LOGI(TAG, "Response format=%s, %zu bytes", response.audio_format, response.audio_len);

        elisa_face_set_state(FACE_STATE_SPEAKING);

        if (strcmp(response.audio_format, "opus") == 0) {
            /* Opus path: decode Ogg Opus -> PCM -> wrap in WAV for playback */
            int16_t *pcm_data = NULL;
            size_t pcm_samples = 0;
            uint32_t sample_rate = 0;

            ret = elisa_opus_decode(response.audio_data, response.audio_len,
                                   &pcm_data, &pcm_samples, &sample_rate);
            /* Free the original Opus data -- we have PCM now */
            elisa_api_free_response(&response);

            if (ret != 0 || pcm_data == NULL) {
                ESP_LOGE(TAG, "Opus decode failed");
                elisa_face_set_state(FACE_STATE_ERROR);
                vTaskDelay(pdMS_TO_TICKS(2000));
                elisa_face_set_state(FACE_STATE_IDLE);
                return ESP_FAIL;
            }

            /* Wrap PCM in WAV header for audio_player_play() */
            uint8_t *wav_data = NULL;
            size_t wav_data_len = 0;
            ret = pcm_to_wav(pcm_data, pcm_samples, sample_rate, &wav_data, &wav_data_len);
            elisa_opus_free(pcm_data);

            if (ret != 0 || wav_data == NULL) {
                ESP_LOGE(TAG, "PCM to WAV conversion failed");
                elisa_face_set_state(FACE_STATE_ERROR);
                vTaskDelay(pdMS_TO_TICKS(2000));
                elisa_face_set_state(FACE_STATE_IDLE);
                return ESP_FAIL;
            }

            ESP_LOGI(TAG, "Opus -> PCM -> WAV: %zu bytes at %luHz",
                     wav_data_len, (unsigned long)sample_rate);

            /* Store in file-static for async playback lifetime */
            s_pending_opus_wav = wav_data;
            s_pending_opus_wav_len = wav_data_len;

            FILE *fp = fmemopen(s_pending_opus_wav, s_pending_opus_wav_len, "rb");
            if (fp != NULL) {
                audio_player_play(fp);
            } else {
                ESP_LOGE(TAG, "fmemopen failed");
                elisa_face_set_state(FACE_STATE_ERROR);
                vTaskDelay(pdMS_TO_TICKS(2000));
                elisa_face_set_state(FACE_STATE_IDLE);
                heap_caps_free(s_pending_opus_wav);
                s_pending_opus_wav = NULL;
            }
        } else {
            /* MP3 path (legacy): play directly via audio_player */
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

    if (s_direct_mode) {
        /* Free direct mode buffers */
        if (s_pending_tts_data) {
            free(s_pending_tts_data);
            s_pending_tts_data = NULL;
            s_pending_tts_len = 0;
        }
        if (s_pending_response_text) {
            free(s_pending_response_text);
            s_pending_response_text = NULL;
        }
    } else {
        /* Free runtime mode response (MP3 path) */
        elisa_api_free_response(&s_pending_audio_response);

        /* Free Opus-decoded WAV buffer if present */
        if (s_pending_opus_wav) {
            heap_caps_free(s_pending_opus_wav);
            s_pending_opus_wav = NULL;
            s_pending_opus_wav_len = 0;
        }
    }
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
