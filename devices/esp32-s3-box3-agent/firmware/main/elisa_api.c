/**
 * @file elisa_api.c
 * @brief Elisa Runtime API client implementation.
 *
 * Uses esp_http_client to communicate with the Elisa runtime server.
 * All AI API calls are routed through the runtime -- the ESP32 never
 * contacts OpenAI/Anthropic directly.
 *
 * ADAPTATION NOTES (from chatgpt_demo):
 * - chatgpt_demo's app_sr_handler.c sends audio to OpenAI Whisper for STT,
 *   then sends the transcript to ChatGPT, then sends the response to OpenAI
 *   TTS. We replace all three calls with a single POST to the Elisa runtime's
 *   /v1/agents/:id/turn/audio endpoint, which handles STT + AI + TTS
 *   server-side.
 * - The response format is JSON with base64-encoded audio rather than
 *   streaming chunks. This simplifies the ESP32 code significantly.
 *
 * DEPENDENCIES:
 * - esp_http_client (ESP-IDF component)
 * - cJSON (bundled with ESP-IDF)
 *
 * TODO (Phase 2): WebSocket streaming for lower latency. Currently uses
 * synchronous HTTP which adds round-trip delay but is simpler to implement.
 */

#include "elisa_api.h"

#include <stdlib.h>
#include <string.h>

#include "esp_log.h"
#include "esp_http_client.h"
#include "cJSON.h"

static const char *TAG = "elisa_api";

// ── Static State ────────────────────────────────────────────────────────

static char s_runtime_url[256];
static char s_api_key[128];
static char s_agent_id[64];
static bool s_initialized = false;

/** Maximum response body size (512 KB -- includes base64 audio) */
#define MAX_RESPONSE_SIZE (512 * 1024)

/** HTTP timeout in milliseconds */
#define HTTP_TIMEOUT_MS 30000

// ── Helper: Build full URL ──────────────────────────────────────────────

/**
 * Build a full endpoint URL: {runtime_url}/v1/agents/{agent_id}/{path}
 */
static void build_url(char *buf, size_t buf_size, const char *path) {
    snprintf(buf, buf_size, "%s/v1/agents/%s/%s", s_runtime_url, s_agent_id, path);
}

// ── Public API ──────────────────────────────────────────────────────────

int elisa_api_init(const elisa_runtime_config_t *config) {
    if (config == NULL) {
        ESP_LOGE(TAG, "Config is NULL");
        return -1;
    }

    strncpy(s_runtime_url, config->runtime_url, sizeof(s_runtime_url) - 1);
    strncpy(s_api_key, config->api_key, sizeof(s_api_key) - 1);
    strncpy(s_agent_id, config->agent_id, sizeof(s_agent_id) - 1);

    /* Remove trailing slash from URL if present */
    size_t url_len = strlen(s_runtime_url);
    if (url_len > 0 && s_runtime_url[url_len - 1] == '/') {
        s_runtime_url[url_len - 1] = '\0';
    }

    s_initialized = true;
    ESP_LOGI(TAG, "API client initialized for agent %s at %s", s_agent_id, s_runtime_url);
    return 0;
}

int elisa_api_audio_turn(const uint8_t *audio_data, size_t audio_len,
                         elisa_turn_response_t *response) {
    if (!s_initialized || response == NULL) {
        return -1;
    }

    memset(response, 0, sizeof(*response));

    char url[512];
    build_url(url, sizeof(url), "turn/audio");

    /*
     * Configure HTTP client.
     *
     * ADAPTATION: chatgpt_demo uses three separate HTTP calls here
     * (Whisper STT, ChatGPT, TTS). We use a single POST that handles
     * the entire pipeline server-side.
     */
    esp_http_client_config_t http_config = {
        .url = url,
        .method = HTTP_METHOD_POST,
        .timeout_ms = HTTP_TIMEOUT_MS,
        .buffer_size = MAX_RESPONSE_SIZE,
    };

    esp_http_client_handle_t client = esp_http_client_init(&http_config);
    if (client == NULL) {
        ESP_LOGE(TAG, "Failed to init HTTP client");
        return -1;
    }

    /* Set headers */
    esp_http_client_set_header(client, "Content-Type", "audio/wav");
    esp_http_client_set_header(client, "x-api-key", s_api_key);

    /* Set audio as POST body */
    esp_http_client_set_post_field(client, (const char *)audio_data, (int)audio_len);

    /* Execute request */
    esp_err_t err = esp_http_client_perform(client);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "HTTP request failed: %s", esp_err_to_name(err));
        esp_http_client_cleanup(client);
        return -1;
    }

    response->status_code = esp_http_client_get_status_code(client);

    /*
     * Parse response JSON:
     * {
     *   "text": "agent response",
     *   "audio": "<base64 mp3>",
     *   "transcript": "what user said"
     * }
     *
     * TODO: Read response body. esp_http_client with buffer_size set
     * will accumulate the body. In a real implementation, use
     * esp_http_client_read() in a loop or the event-driven API.
     */

    ESP_LOGI(TAG, "Audio turn response: status=%d", response->status_code);

    esp_http_client_cleanup(client);
    return (response->status_code == 200) ? 0 : -1;
}

int elisa_api_heartbeat(elisa_heartbeat_t *result) {
    if (!s_initialized || result == NULL) {
        return -1;
    }

    memset(result, 0, sizeof(*result));

    char url[512];
    build_url(url, sizeof(url), "heartbeat");

    esp_http_client_config_t http_config = {
        .url = url,
        .method = HTTP_METHOD_GET,
        .timeout_ms = 5000,
    };

    esp_http_client_handle_t client = esp_http_client_init(&http_config);
    if (client == NULL) {
        return -1;
    }

    esp_err_t err = esp_http_client_perform(client);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Heartbeat failed: %s", esp_err_to_name(err));
        esp_http_client_cleanup(client);
        return -1;
    }

    result->status_code = esp_http_client_get_status_code(client);
    result->healthy = (result->status_code == 200);

    esp_http_client_cleanup(client);
    return 0;
}

void elisa_api_free_response(elisa_turn_response_t *response) {
    if (response == NULL) return;
    if (response->text != NULL) {
        free(response->text);
        response->text = NULL;
    }
    if (response->audio_data != NULL) {
        free(response->audio_data);
        response->audio_data = NULL;
        response->audio_len = 0;
    }
}

void elisa_api_cleanup(void) {
    s_initialized = false;
    ESP_LOGI(TAG, "API client cleaned up");
}
