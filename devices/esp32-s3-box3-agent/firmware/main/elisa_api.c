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
 * - esp_crt_bundle (for TLS to api.anthropic.com)
 */

#include "elisa_api.h"

#include <stdlib.h>
#include <string.h>

#include "esp_log.h"
#include "esp_http_client.h"
#include "esp_crt_bundle.h"
#include "cJSON.h"
#include "mbedtls/base64.h"

static const char *TAG = "elisa_api";

// ── Static State ────────────────────────────────────────────────────────

static char s_runtime_url[256];
static char s_api_key[128];
static char s_agent_id[64];
static bool s_initialized = false;

/** Maximum response body size (1 MB -- safety margin with Opus binary responses) */
#define MAX_RESPONSE_SIZE (1024 * 1024)

/** HTTP timeout in milliseconds */
#define HTTP_TIMEOUT_MS 30000

// ── HTTP Response Accumulator ───────────────────────────────────────────

/**
 * Context passed to the HTTP event handler to accumulate the response body
 * and capture response headers for binary responses.
 */
typedef struct {
    char *body;
    size_t body_len;
    size_t body_capacity;
    /* Response headers captured for binary response path */
    char content_type[64];
    char x_audio_format[16];
    char x_response_text[1024];
    char x_session_id[128];
} http_response_ctx_t;

/**
 * HTTP event handler that accumulates response body data and captures headers.
 * Attached to esp_http_client via event_handler + user_data.
 */
static esp_err_t http_event_handler(esp_http_client_event_t *evt) {
    http_response_ctx_t *ctx = (http_response_ctx_t *)evt->user_data;
    if (ctx == NULL) return ESP_OK;

    switch (evt->event_id) {
    case HTTP_EVENT_ON_HEADER:
        if (strcasecmp(evt->header_key, "Content-Type") == 0) {
            strncpy(ctx->content_type, evt->header_value, sizeof(ctx->content_type) - 1);
        } else if (strcasecmp(evt->header_key, "X-Audio-Format") == 0) {
            strncpy(ctx->x_audio_format, evt->header_value, sizeof(ctx->x_audio_format) - 1);
        } else if (strcasecmp(evt->header_key, "X-Response-Text") == 0) {
            strncpy(ctx->x_response_text, evt->header_value, sizeof(ctx->x_response_text) - 1);
        } else if (strcasecmp(evt->header_key, "X-Session-Id") == 0) {
            strncpy(ctx->x_session_id, evt->header_value, sizeof(ctx->x_session_id) - 1);
        }
        break;
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

// ── URL Decode Helper ───────────────────────────────────────────────────

/**
 * In-place URL-decode a percent-encoded string (e.g. from X-Response-Text header).
 * Handles %XX sequences and '+' as space.
 */
static void url_decode_inplace(char *str) {
    char *src = str;
    char *dst = str;
    while (*src) {
        if (*src == '%' && src[1] && src[2]) {
            char hex[3] = { src[1], src[2], '\0' };
            *dst = (char)strtol(hex, NULL, 16);
            src += 3;
        } else if (*src == '+') {
            *dst = ' ';
            src++;
        } else {
            *dst = *src;
            src++;
        }
        dst++;
    }
    *dst = '\0';
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
    strncpy(response->audio_format, "mp3", sizeof(response->audio_format) - 1);

    char url[512];
    build_url(url, sizeof(url), "turn/audio?format=wav");

    /* Response body accumulator */
    http_response_ctx_t resp_ctx = {0};

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

    /* Set headers -- request Opus in binary format */
    esp_http_client_set_header(client, "Content-Type", "application/octet-stream");
    esp_http_client_set_header(client, "x-api-key", s_api_key);
    esp_http_client_set_header(client, "Accept", "audio/opus, application/octet-stream");

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

    /* Check Content-Type to determine response format */
    bool is_binary = (strstr(resp_ctx.content_type, "application/octet-stream") != NULL);

    if (is_binary) {
        /* Binary response: raw audio bytes, metadata in headers */
        ESP_LOGI(TAG, "Response: application/octet-stream, format=%s, %zu bytes",
                 resp_ctx.x_audio_format, resp_ctx.body_len);

        /* Copy audio format from header */
        if (strlen(resp_ctx.x_audio_format) > 0) {
            strncpy(response->audio_format, resp_ctx.x_audio_format,
                    sizeof(response->audio_format) - 1);
        }

        /* Extract response text from URL-encoded header */
        if (strlen(resp_ctx.x_response_text) > 0) {
            url_decode_inplace(resp_ctx.x_response_text);
            response->text = strdup(resp_ctx.x_response_text);
        }

        /* Body is raw audio -- take ownership */
        response->audio_data = (uint8_t *)resp_ctx.body;
        response->audio_len = resp_ctx.body_len;
        resp_ctx.body = NULL; /* prevent free below */

    } else {
        /* JSON response (legacy path): parse base64-encoded audio */

        /* Null-terminate for JSON parsing */
        char *json_str = (char *)realloc(resp_ctx.body, resp_ctx.body_len + 1);
        if (json_str == NULL) {
            free(resp_ctx.body);
            return -1;
        }
        json_str[resp_ctx.body_len] = '\0';

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

        /* Extract audio format */
        cJSON *fmt_item = cJSON_GetObjectItem(root, "audio_format");
        if (cJSON_IsString(fmt_item) && fmt_item->valuestring != NULL) {
            strncpy(response->audio_format, fmt_item->valuestring,
                    sizeof(response->audio_format) - 1);
        }

        /* Extract and decode base64 audio */
        cJSON *audio_item = cJSON_GetObjectItem(root, "audio_base64");
        if (cJSON_IsString(audio_item) && audio_item->valuestring != NULL) {
            size_t b64_len = strlen(audio_item->valuestring);
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
    }

    free(resp_ctx.body);

    ESP_LOGI(TAG, "Audio turn response: status=%d text=%s format=%s audio=%zu bytes",
             response->status_code,
             response->text ? "yes" : "no",
             response->audio_format,
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

// ── Direct Claude API ───────────────────────────────────────────────────

#define CLAUDE_API_URL "https://api.anthropic.com/v1/messages"
#define CLAUDE_MODEL   "claude-haiku-4-5-20251001"
#define CLAUDE_MAX_TOKENS 256
#define CLAUDE_TIMEOUT_MS 30000

static char s_claude_api_key[128];
static char s_claude_system_prompt[512];
static bool s_claude_initialized = false;

int elisa_claude_init(const char *api_key, const char *system_prompt) {
    if (api_key == NULL || strlen(api_key) == 0) {
        ESP_LOGE(TAG, "Claude API key is required");
        return -1;
    }

    strncpy(s_claude_api_key, api_key, sizeof(s_claude_api_key) - 1);
    s_claude_api_key[sizeof(s_claude_api_key) - 1] = '\0';

    if (system_prompt != NULL && strlen(system_prompt) > 0) {
        strncpy(s_claude_system_prompt, system_prompt, sizeof(s_claude_system_prompt) - 1);
        s_claude_system_prompt[sizeof(s_claude_system_prompt) - 1] = '\0';
    } else {
        strncpy(s_claude_system_prompt,
                "You are a helpful voice assistant. Keep responses to 1-2 sentences for natural conversation.",
                sizeof(s_claude_system_prompt) - 1);
    }

    s_claude_initialized = true;
    ESP_LOGI(TAG, "Claude API initialized (model: " CLAUDE_MODEL ")");
    return 0;
}

int elisa_claude_chat(const char *user_message, char **response_text) {
    if (!s_claude_initialized || user_message == NULL || response_text == NULL) {
        return -1;
    }
    *response_text = NULL;

    /* Build JSON request body */
    cJSON *root = cJSON_CreateObject();
    cJSON_AddStringToObject(root, "model", CLAUDE_MODEL);
    cJSON_AddNumberToObject(root, "max_tokens", CLAUDE_MAX_TOKENS);
    cJSON_AddStringToObject(root, "system", s_claude_system_prompt);

    cJSON *messages = cJSON_AddArrayToObject(root, "messages");
    cJSON *msg = cJSON_CreateObject();
    cJSON_AddStringToObject(msg, "role", "user");
    cJSON_AddStringToObject(msg, "content", user_message);
    cJSON_AddItemToArray(messages, msg);

    char *body = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);

    if (body == NULL) {
        ESP_LOGE(TAG, "Failed to serialize Claude request");
        return -1;
    }

    ESP_LOGI(TAG, "Claude request: %zu bytes", strlen(body));

    /* Response body accumulator */
    http_response_ctx_t resp_ctx = { .body = NULL, .body_len = 0, .body_capacity = 0 };

    /* Build auth header value: "Bearer <key>" -- no, Anthropic uses x-api-key */
    esp_http_client_config_t http_config = {
        .url = CLAUDE_API_URL,
        .method = HTTP_METHOD_POST,
        .timeout_ms = CLAUDE_TIMEOUT_MS,
        .buffer_size = 4096,
        .event_handler = http_event_handler,
        .user_data = &resp_ctx,
        .crt_bundle_attach = esp_crt_bundle_attach,
    };

    esp_http_client_handle_t client = esp_http_client_init(&http_config);
    if (client == NULL) {
        ESP_LOGE(TAG, "Failed to init Claude HTTP client");
        free(body);
        return -1;
    }

    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_header(client, "x-api-key", s_claude_api_key);
    esp_http_client_set_header(client, "anthropic-version", "2023-06-01");
    esp_http_client_set_post_field(client, body, (int)strlen(body));

    esp_err_t err = esp_http_client_perform(client);
    free(body);

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Claude HTTP request failed: %s", esp_err_to_name(err));
        free(resp_ctx.body);
        esp_http_client_cleanup(client);
        return -1;
    }

    int status = esp_http_client_get_status_code(client);
    esp_http_client_cleanup(client);

    if (status != 200 || resp_ctx.body == NULL || resp_ctx.body_len == 0) {
        ESP_LOGE(TAG, "Claude API error: status=%d body_len=%zu", status, resp_ctx.body_len);
        if (resp_ctx.body != NULL) {
            /* Null-terminate for logging */
            char *err_body = (char *)realloc(resp_ctx.body, resp_ctx.body_len + 1);
            if (err_body) {
                err_body[resp_ctx.body_len] = '\0';
                ESP_LOGE(TAG, "Claude error body: %.200s", err_body);
                free(err_body);
            } else {
                free(resp_ctx.body);
            }
        }
        return -1;
    }

    /* Null-terminate response */
    char *json_str = (char *)realloc(resp_ctx.body, resp_ctx.body_len + 1);
    if (json_str == NULL) {
        free(resp_ctx.body);
        return -1;
    }
    json_str[resp_ctx.body_len] = '\0';

    /* Parse Claude Messages API response:
     * {
     *   "content": [{ "type": "text", "text": "response here" }],
     *   "usage": { "input_tokens": N, "output_tokens": N }
     * }
     */
    cJSON *resp_root = cJSON_Parse(json_str);
    free(json_str);

    if (resp_root == NULL) {
        ESP_LOGE(TAG, "Failed to parse Claude response JSON");
        return -1;
    }

    cJSON *content = cJSON_GetObjectItemCaseSensitive(resp_root, "content");
    if (cJSON_IsArray(content) && cJSON_GetArraySize(content) > 0) {
        cJSON *first = cJSON_GetArrayItem(content, 0);
        cJSON *text_item = cJSON_GetObjectItemCaseSensitive(first, "text");
        if (cJSON_IsString(text_item) && text_item->valuestring != NULL) {
            *response_text = strdup(text_item->valuestring);
        }
    }

    /* Log usage */
    cJSON *usage = cJSON_GetObjectItemCaseSensitive(resp_root, "usage");
    if (cJSON_IsObject(usage)) {
        cJSON *input_tok = cJSON_GetObjectItemCaseSensitive(usage, "input_tokens");
        cJSON *output_tok = cJSON_GetObjectItemCaseSensitive(usage, "output_tokens");
        ESP_LOGI(TAG, "Claude tokens: in=%d out=%d",
                 cJSON_IsNumber(input_tok) ? input_tok->valueint : 0,
                 cJSON_IsNumber(output_tok) ? output_tok->valueint : 0);
    }

    cJSON_Delete(resp_root);

    if (*response_text == NULL) {
        ESP_LOGE(TAG, "No text content in Claude response");
        return -1;
    }

    ESP_LOGI(TAG, "Claude: %s", *response_text);
    return 0;
}
