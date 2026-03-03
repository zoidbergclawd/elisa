/**
 * @file elisa_api.c
 * @brief Elisa Runtime API client implementation.
 *
 * Uses esp_http_client to communicate with the Elisa runtime server.
 * All AI API calls are routed through the runtime -- the ESP32 never
 * contacts OpenAI/Anthropic directly.
 *
 * The single POST to /v1/agents/:id/turn/audio?format=wav replaces
 * chatgpt_demo's 3-call chain (Whisper STT -> ChatGPT -> OpenAI TTS).
 * The runtime handles STT + AI + TTS server-side and returns JSON with
 * base64-encoded MP3 audio.
 *
 * DEPENDENCIES:
 * - esp_http_client (ESP-IDF component)
 * - cJSON (bundled with ESP-IDF)
 * - mbedtls (bundled with ESP-IDF, for base64 decode)
 */

#include "elisa_api.h"

#include <stdlib.h>
#include <string.h>

#include "esp_log.h"
#include "esp_http_client.h"
#include "cJSON.h"
#include "mbedtls/base64.h"

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

// ── HTTP Response Accumulator ───────────────────────────────────────────

/**
 * Context passed to the HTTP event handler to accumulate the response body.
 */
typedef struct {
    char *body;
    size_t body_len;
    size_t body_capacity;
} http_response_ctx_t;

/**
 * HTTP event handler that accumulates response body data.
 * Attached to esp_http_client via event_handler + user_data.
 */
static esp_err_t http_event_handler(esp_http_client_event_t *evt) {
    http_response_ctx_t *ctx = (http_response_ctx_t *)evt->user_data;
    if (ctx == NULL) return ESP_OK;

    switch (evt->event_id) {
    case HTTP_EVENT_ON_DATA:
        if (ctx->body_len + evt->data_len > MAX_RESPONSE_SIZE) {
            ESP_LOGE(TAG, "Response exceeds %d bytes limit", MAX_RESPONSE_SIZE);
            return ESP_FAIL;
        }
        if (ctx->body == NULL) {
            ctx->body_capacity = (evt->data_len > 4096) ? evt->data_len * 2 : 4096;
            ctx->body = (char *)malloc(ctx->body_capacity);
        } else if (ctx->body_len + evt->data_len > ctx->body_capacity) {
            ctx->body_capacity = (ctx->body_len + evt->data_len) * 2;
            char *new_body = (char *)realloc(ctx->body, ctx->body_capacity);
            if (new_body == NULL) {
                free(ctx->body);
                ctx->body = NULL;
                return ESP_FAIL;
            }
            ctx->body = new_body;
        }
        if (ctx->body == NULL) return ESP_FAIL;
        memcpy(ctx->body + ctx->body_len, evt->data, evt->data_len);
        ctx->body_len += evt->data_len;
        break;
    default:
        break;
    }
    return ESP_OK;
}

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
    build_url(url, sizeof(url), "turn/audio?format=wav");

    /* Response body accumulator */
    http_response_ctx_t resp_ctx = { .body = NULL, .body_len = 0, .body_capacity = 0 };

    esp_http_client_config_t http_config = {
        .url = url,
        .method = HTTP_METHOD_POST,
        .timeout_ms = HTTP_TIMEOUT_MS,
        .buffer_size = 4096,
        .event_handler = http_event_handler,
        .user_data = &resp_ctx,
    };

    esp_http_client_handle_t client = esp_http_client_init(&http_config);
    if (client == NULL) {
        ESP_LOGE(TAG, "Failed to init HTTP client");
        return -1;
    }

    /* Set headers */
    esp_http_client_set_header(client, "Content-Type", "application/octet-stream");
    esp_http_client_set_header(client, "x-api-key", s_api_key);

    /* Set audio as POST body */
    esp_http_client_set_post_field(client, (const char *)audio_data, (int)audio_len);

    /* Execute request */
    esp_err_t err = esp_http_client_perform(client);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "HTTP request failed: %s", esp_err_to_name(err));
        free(resp_ctx.body);
        esp_http_client_cleanup(client);
        return -1;
    }

    response->status_code = esp_http_client_get_status_code(client);
    esp_http_client_cleanup(client);

    if (response->status_code != 200 || resp_ctx.body == NULL || resp_ctx.body_len == 0) {
        ESP_LOGE(TAG, "Audio turn failed: status=%d body_len=%zu",
                 response->status_code, resp_ctx.body_len);
        free(resp_ctx.body);
        return -1;
    }

    /* Null-terminate for JSON parsing */
    char *json_str = (char *)realloc(resp_ctx.body, resp_ctx.body_len + 1);
    if (json_str == NULL) {
        free(resp_ctx.body);
        return -1;
    }
    json_str[resp_ctx.body_len] = '\0';

    /* Parse JSON response:
     * {
     *   "response_text": "agent's reply",
     *   "audio_base64": "<base64-encoded MP3>"
     * }
     */
    cJSON *root = cJSON_Parse(json_str);
    free(json_str);

    if (root == NULL) {
        ESP_LOGE(TAG, "Failed to parse response JSON");
        return -1;
    }

    /* Extract response text */
    cJSON *text_item = cJSON_GetObjectItem(root, "response_text");
    if (cJSON_IsString(text_item) && text_item->valuestring != NULL) {
        response->text = strdup(text_item->valuestring);
    }

    /* Extract and decode base64 audio */
    cJSON *audio_item = cJSON_GetObjectItem(root, "audio_base64");
    if (cJSON_IsString(audio_item) && audio_item->valuestring != NULL) {
        size_t b64_len = strlen(audio_item->valuestring);
        /* Decoded size is at most 3/4 of base64 length */
        size_t decoded_max = (b64_len * 3) / 4 + 4;
        response->audio_data = (uint8_t *)malloc(decoded_max);

        if (response->audio_data != NULL) {
            size_t decoded_len = 0;
            int ret = mbedtls_base64_decode(
                response->audio_data, decoded_max, &decoded_len,
                (const unsigned char *)audio_item->valuestring, b64_len);

            if (ret == 0) {
                response->audio_len = decoded_len;
                ESP_LOGI(TAG, "Decoded %zu bytes of audio from base64", decoded_len);
            } else {
                ESP_LOGE(TAG, "Base64 decode failed: %d", ret);
                free(response->audio_data);
                response->audio_data = NULL;
                response->audio_len = 0;
            }
        }
    }

    cJSON_Delete(root);

    ESP_LOGI(TAG, "Audio turn response: status=%d text=%s audio=%zu bytes",
             response->status_code,
             response->text ? "yes" : "no",
             response->audio_len);

    return 0;
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
