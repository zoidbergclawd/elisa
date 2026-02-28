/**
 * @file elisa_config.h
 * @brief Configuration structures for Elisa runtime on ESP32-S3-BOX-3.
 *
 * This header defines the runtime configuration loaded from SPIFFS on boot
 * and the face animation state machine. The config is written as
 * runtime_config.json by the Elisa deploy pipeline (EsptoolFlashStrategy)
 * and parsed by elisa_config.c using cJSON.
 *
 * ADAPTATION NOTES (from chatgpt_demo):
 * - chatgpt_demo stores WiFi creds in menuconfig (Kconfig). We read them
 *   from runtime_config.json instead, so credentials can change per-deploy
 *   without rebuilding firmware.
 * - chatgpt_demo hardcodes the OpenAI API endpoint. We replace that with
 *   runtime_url + api_key for the Elisa runtime API.
 */

#ifndef ELISA_CONFIG_H
#define ELISA_CONFIG_H

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// ── Runtime Configuration ───────────────────────────────────────────────

/**
 * Runtime configuration loaded from /spiffs/runtime_config.json.
 * Written by the Elisa backend's EsptoolFlashStrategy during deploy.
 */
typedef struct {
    char agent_id[64];       /**< UUID from agent provisioning */
    char api_key[128];       /**< Runtime API key (eart_ prefixed) */
    char runtime_url[256];   /**< Base URL of Elisa runtime server */
    char wifi_ssid[64];      /**< WiFi network SSID */
    char wifi_password[64];  /**< WiFi network password */
    char agent_name[64];     /**< Human-readable agent name */
    char wake_word[64];      /**< Wake word for ESP-SR (e.g. "Hi Elisa") */
    char display_theme[32];  /**< Theme ID (matches backend DisplayTheme.id) */
} elisa_runtime_config_t;

// ── Face State Machine ──────────────────────────────────────────────────

/**
 * Face animation states for the LVGL face renderer.
 * Maps to FaceDescriptor + animation parameters in elisa_face.c.
 */
typedef enum {
    FACE_STATE_IDLE,       /**< Default: slow blink animation */
    FACE_STATE_LISTENING,  /**< Wake word detected: eyes widen, pulse ring */
    FACE_STATE_THINKING,   /**< Waiting for API response: dots animation */
    FACE_STATE_SPEAKING,   /**< TTS playing: mouth animates with amplitude */
    FACE_STATE_ERROR,      /**< Error state: sad expression, red accent */
} face_state_t;

// ── Face Descriptor (parsed from JSON) ──────────────────────────────────

/**
 * Eye configuration parsed from face_descriptor.eyes JSON.
 */
typedef struct {
    char style[16];    /**< "dots", "circles", "anime", "pixels", "sleepy" */
    char size[16];     /**< "small", "medium", "large" */
    uint32_t color;    /**< RGB color parsed from hex string */
} face_eyes_t;

/**
 * Mouth configuration parsed from face_descriptor.mouth JSON.
 */
typedef struct {
    char style[16];    /**< "line", "smile", "zigzag", "open", "cat" */
} face_mouth_t;

/**
 * Complete face descriptor parsed from runtime_config.json.
 * Used by elisa_face.c to render the agent avatar with LVGL.
 */
typedef struct {
    char base_shape[16];   /**< "round", "square", "oval" */
    face_eyes_t eyes;
    face_mouth_t mouth;
    char expression[16];   /**< "happy", "neutral", "excited", "shy", "cool" */
    uint32_t face_color;   /**< RGB background color */
    uint32_t accent_color; /**< RGB cheeks/highlights color */
} face_descriptor_t;

// ── API Functions ───────────────────────────────────────────────────────

/**
 * Load runtime configuration from /spiffs/runtime_config.json.
 *
 * Must be called after SPIFFS is initialized. Parses JSON with cJSON
 * and populates the internal config struct. Also parses face_descriptor
 * if present.
 *
 * @return ESP_OK on success, ESP_FAIL on file read or parse error
 */
int elisa_load_config(void);

/**
 * Get pointer to the loaded runtime configuration.
 * Returns NULL if elisa_load_config() has not been called or failed.
 */
const elisa_runtime_config_t* elisa_get_config(void);

/**
 * Get pointer to the parsed face descriptor.
 * Returns NULL if no face_descriptor was present in config or load failed.
 */
const face_descriptor_t* elisa_get_face_descriptor(void);

#ifdef __cplusplus
}
#endif

#endif /* ELISA_CONFIG_H */
