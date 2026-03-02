/**
 * @file elisa_config.c
 * @brief Runtime configuration loader for Elisa on ESP32-S3-BOX-3.
 *
 * Reads /spiffs/runtime_config.json on boot and parses it with cJSON.
 * This file replaces the chatgpt_demo's Kconfig-based configuration
 * approach, allowing per-deploy configuration without firmware rebuilds.
 *
 * ADAPTATION NOTES (from chatgpt_demo):
 * - chatgpt_demo uses menuconfig for WiFi/API settings. We read JSON from
 *   SPIFFS instead. The JSON is written by EsptoolFlashStrategy during deploy.
 * - chatgpt_demo has no face descriptor. We parse the face_descriptor object
 *   to drive the LVGL face renderer (elisa_face.c).
 *
 * DEPENDENCIES:
 * - ESP-IDF SPIFFS component (esp_spiffs)
 * - cJSON (bundled with ESP-IDF)
 */

#include "elisa_config.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "esp_log.h"
#include "esp_spiffs.h"
#include "cJSON.h"

static const char *TAG = "elisa_config";

/** Path to runtime config on SPIFFS partition */
#define CONFIG_PATH "/spiffs/runtime_config.json"

/** Maximum config file size (8 KB should be plenty) */
#define MAX_CONFIG_SIZE 8192

// ── Static State ────────────────────────────────────────────────────────

static elisa_runtime_config_t s_config;
static face_descriptor_t s_face;
static bool s_config_loaded = false;
static bool s_face_loaded = false;

// ── Helper: Parse hex color string to uint32_t ──────────────────────────

/**
 * Parse a "#RRGGBB" hex color string into a uint32_t (0x00RRGGBB).
 * Returns 0 on invalid input.
 */
static uint32_t parse_hex_color(const char *hex_str) {
    if (hex_str == NULL || hex_str[0] != '#' || strlen(hex_str) != 7) {
        return 0;
    }
    return (uint32_t)strtol(hex_str + 1, NULL, 16);
}

// ── Helper: Safe string copy ────────────────────────────────────────────

static void safe_strcpy(char *dest, size_t dest_size, const cJSON *json, const char *key, const char *fallback) {
    const cJSON *item = cJSON_GetObjectItemCaseSensitive(json, key);
    if (cJSON_IsString(item) && item->valuestring != NULL) {
        strncpy(dest, item->valuestring, dest_size - 1);
        dest[dest_size - 1] = '\0';
    } else if (fallback != NULL) {
        strncpy(dest, fallback, dest_size - 1);
        dest[dest_size - 1] = '\0';
    } else {
        dest[0] = '\0';
    }
}

// ── Face Descriptor Parsing ─────────────────────────────────────────────

static void parse_face_descriptor(const cJSON *face_json) {
    if (face_json == NULL || !cJSON_IsObject(face_json)) {
        ESP_LOGW(TAG, "No face_descriptor in config, using defaults");
        /* Set defaults matching DEFAULT_FACE from display.ts */
        strncpy(s_face.base_shape, "round", sizeof(s_face.base_shape));
        strncpy(s_face.eyes.style, "circles", sizeof(s_face.eyes.style));
        strncpy(s_face.eyes.size, "medium", sizeof(s_face.eyes.size));
        s_face.eyes.color = 0x4361ee;
        strncpy(s_face.mouth.style, "smile", sizeof(s_face.mouth.style));
        strncpy(s_face.expression, "happy", sizeof(s_face.expression));
        s_face.face_color = 0xf0f0f0;
        s_face.accent_color = 0xffb3ba;
        s_face_loaded = true;
        return;
    }

    safe_strcpy(s_face.base_shape, sizeof(s_face.base_shape), face_json, "base_shape", "round");

    /* Parse eyes */
    const cJSON *eyes = cJSON_GetObjectItemCaseSensitive(face_json, "eyes");
    if (cJSON_IsObject(eyes)) {
        safe_strcpy(s_face.eyes.style, sizeof(s_face.eyes.style), eyes, "style", "circles");
        safe_strcpy(s_face.eyes.size, sizeof(s_face.eyes.size), eyes, "size", "medium");
        const cJSON *eye_color = cJSON_GetObjectItemCaseSensitive(eyes, "color");
        s_face.eyes.color = cJSON_IsString(eye_color) ? parse_hex_color(eye_color->valuestring) : 0x4361ee;
    }

    /* Parse mouth */
    const cJSON *mouth = cJSON_GetObjectItemCaseSensitive(face_json, "mouth");
    if (cJSON_IsObject(mouth)) {
        safe_strcpy(s_face.mouth.style, sizeof(s_face.mouth.style), mouth, "style", "smile");
    }

    safe_strcpy(s_face.expression, sizeof(s_face.expression), face_json, "expression", "happy");

    /* Parse colors */
    const cJSON *colors = cJSON_GetObjectItemCaseSensitive(face_json, "colors");
    if (cJSON_IsObject(colors)) {
        const cJSON *face_col = cJSON_GetObjectItemCaseSensitive(colors, "face");
        const cJSON *accent_col = cJSON_GetObjectItemCaseSensitive(colors, "accent");
        s_face.face_color = cJSON_IsString(face_col) ? parse_hex_color(face_col->valuestring) : 0xf0f0f0;
        s_face.accent_color = cJSON_IsString(accent_col) ? parse_hex_color(accent_col->valuestring) : 0xffb3ba;
    }

    s_face_loaded = true;
    ESP_LOGI(TAG, "Face: shape=%s eyes=%s(%s) mouth=%s expr=%s",
             s_face.base_shape, s_face.eyes.style, s_face.eyes.size,
             s_face.mouth.style, s_face.expression);
}

// ── Public API ──────────────────────────────────────────────────────────

int elisa_load_config(void) {
    /* Read config file from SPIFFS */
    FILE *f = fopen(CONFIG_PATH, "r");
    if (f == NULL) {
        ESP_LOGE(TAG, "Failed to open %s", CONFIG_PATH);
        return -1; /* ESP_FAIL */
    }

    char *buf = (char *)malloc(MAX_CONFIG_SIZE);
    if (buf == NULL) {
        fclose(f);
        ESP_LOGE(TAG, "Failed to allocate config buffer");
        return -1;
    }

    size_t len = fread(buf, 1, MAX_CONFIG_SIZE - 1, f);
    fclose(f);
    buf[len] = '\0';

    /* Parse JSON */
    cJSON *root = cJSON_Parse(buf);
    free(buf);

    if (root == NULL) {
        const char *err = cJSON_GetErrorPtr();
        ESP_LOGE(TAG, "JSON parse error near: %.20s", err ? err : "unknown");
        return -1;
    }

    /* Extract fields into config struct */
    safe_strcpy(s_config.agent_id, sizeof(s_config.agent_id), root, "agent_id", NULL);
    safe_strcpy(s_config.api_key, sizeof(s_config.api_key), root, "api_key", NULL);
    safe_strcpy(s_config.runtime_url, sizeof(s_config.runtime_url), root, "runtime_url", NULL);
    safe_strcpy(s_config.wifi_ssid, sizeof(s_config.wifi_ssid), root, "wifi_ssid", NULL);
    safe_strcpy(s_config.wifi_password, sizeof(s_config.wifi_password), root, "wifi_password", NULL);
    safe_strcpy(s_config.agent_name, sizeof(s_config.agent_name), root, "agent_name", "Elisa Agent");
    safe_strcpy(s_config.wake_word, sizeof(s_config.wake_word), root, "wake_word", "Hi Elisa");
    safe_strcpy(s_config.display_theme, sizeof(s_config.display_theme), root, "display_theme", "default");

    /* Validate required fields */
    if (strlen(s_config.agent_id) == 0 || strlen(s_config.api_key) == 0 || strlen(s_config.runtime_url) == 0) {
        ESP_LOGE(TAG, "Missing required config fields (agent_id, api_key, or runtime_url)");
        cJSON_Delete(root);
        return -1;
    }

    /* Parse face descriptor */
    const cJSON *face = cJSON_GetObjectItemCaseSensitive(root, "face_descriptor");
    parse_face_descriptor(face);

    cJSON_Delete(root);
    s_config_loaded = true;

    ESP_LOGI(TAG, "Config loaded: agent=%s name=%s wake=%s theme=%s",
             s_config.agent_id, s_config.agent_name,
             s_config.wake_word, s_config.display_theme);

    return 0; /* ESP_OK */
}

const elisa_runtime_config_t* elisa_get_config(void) {
    return s_config_loaded ? &s_config : NULL;
}

const face_descriptor_t* elisa_get_face_descriptor(void) {
    return s_face_loaded ? &s_face : NULL;
}
