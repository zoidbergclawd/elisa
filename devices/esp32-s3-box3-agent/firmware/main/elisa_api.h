/**
 * @file elisa_api.h
 * @brief Elisa Runtime API client for ESP32-S3-BOX-3.
 *
 * HTTP client that communicates with the Elisa runtime server instead of
 * calling OpenAI/Claude APIs directly. This keeps API keys server-side
 * and routes all AI interactions through the runtime.
 *
 * ADAPTATION NOTES (from chatgpt_demo):
 * - chatgpt_demo calls OpenAI directly from the ESP32 using esp_http_client.
 *   We replace those calls with Elisa runtime endpoints:
 *     POST /v1/agents/:id/turn/audio  (audio conversation turn)
 *     GET  /v1/agents/:id/heartbeat   (health check)
 * - The device authenticates with x-api-key header (the eart_ key from config).
 * - Audio is sent as raw PCM and TTS audio is returned as MP3.
 */

#ifndef ELISA_API_H
#define ELISA_API_H

#include <stdint.h>
#include <stddef.h>
#include "elisa_config.h"

#ifdef __cplusplus
extern "C" {
#endif

// ── Response Structure ──────────────────────────────────────────────────

/**
 * Response from an audio conversation turn.
 * Contains the agent's text response and TTS audio data.
 */
typedef struct {
    char *text;           /**< Agent response text (malloc'd, caller frees) */
    uint8_t *audio_data;  /**< TTS audio data as MP3 (malloc'd, caller frees) */
    size_t audio_len;     /**< Length of audio_data in bytes */
    int status_code;      /**< HTTP status code from runtime */
} elisa_turn_response_t;

/**
 * Heartbeat response from runtime health check.
 */
typedef struct {
    bool healthy;         /**< True if runtime is reachable and agent is valid */
    int status_code;      /**< HTTP status code */
} elisa_heartbeat_t;

// ── API Functions ───────────────────────────────────────────────────────

/**
 * Initialize the Elisa API client.
 *
 * Sets up the esp_http_client with the runtime URL and API key from config.
 * Must be called after elisa_load_config() and WiFi connection.
 *
 * ADAPTATION: replaces chatgpt_demo's OpenAI client init.
 *
 * @param config Pointer to loaded runtime config
 * @return 0 on success, -1 on error
 */
int elisa_api_init(const elisa_runtime_config_t *config);

/**
 * Send an audio conversation turn to the runtime.
 *
 * Sends recorded audio to POST /v1/agents/:id/turn/audio with:
 * - Content-Type: audio/wav
 * - x-api-key: <api_key>
 *
 * The runtime transcribes the audio (Whisper STT), processes it through
 * the agent's conversation pipeline, and returns text + TTS audio.
 *
 * ADAPTATION: replaces chatgpt_demo's direct OpenAI Whisper + ChatGPT calls.
 *
 * @param audio_data Raw PCM audio data from I2S microphone
 * @param audio_len  Length of audio data in bytes
 * @param response   Output: populated with response text and TTS audio
 * @return 0 on success, -1 on error
 */
int elisa_api_audio_turn(const uint8_t *audio_data, size_t audio_len,
                         elisa_turn_response_t *response);

/**
 * Send heartbeat to check runtime connectivity.
 *
 * Calls GET /v1/agents/:id/heartbeat. No authentication required.
 * Used during startup to verify the runtime is reachable before
 * entering the main conversation loop.
 *
 * @param result Output: populated with health status
 * @return 0 on success (even if unhealthy), -1 on network error
 */
int elisa_api_heartbeat(elisa_heartbeat_t *result);

/**
 * Free resources allocated in a turn response.
 * Safe to call with NULL fields.
 */
void elisa_api_free_response(elisa_turn_response_t *response);

/**
 * Clean up the API client. Call before shutdown.
 */
void elisa_api_cleanup(void);

#ifdef __cplusplus
}
#endif

#endif /* ELISA_API_H */
