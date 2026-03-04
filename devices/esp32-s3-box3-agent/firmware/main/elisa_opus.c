/**
 * @file elisa_opus.c
 * @brief Ogg Opus decoder wrapper using esphome/micro-opus.
 *
 * Decodes Ogg Opus audio (from OpenAI TTS response_format: 'opus') into
 * PCM int16 samples suitable for playback via I2S on the ES8311 codec.
 *
 * The micro-opus component provides OggOpusDecoder with Xtensa DSP
 * optimizations and PSRAM support. We use its streaming API to decode
 * the entire Ogg Opus file in one pass.
 *
 * DEPENDENCIES:
 * - esphome/micro-opus (added via idf_component.yml)
 * - esp_heap_caps (for PSRAM allocation)
 */

#include "elisa_opus.h"

#include <stdlib.h>
#include <string.h>

#include "esp_log.h"
#include "esp_heap_caps.h"
#include "ogg_opus_decoder.h"

static const char *TAG = "elisa_opus";

/** Maximum decoded PCM size: 60 seconds of 48kHz mono (5.5 MB in PSRAM). */
#define MAX_PCM_SAMPLES (48000 * 60)

/** Decode chunk size: number of samples per opus_decode call (120ms at 48kHz). */
#define DECODE_CHUNK_SAMPLES 5760

int elisa_opus_decode(const uint8_t *ogg_data, size_t ogg_len,
                      int16_t **pcm_out, size_t *pcm_samples,
                      uint32_t *sample_rate) {
    if (ogg_data == NULL || ogg_len == 0 || pcm_out == NULL ||
        pcm_samples == NULL || sample_rate == NULL) {
        return -1;
    }

    *pcm_out = NULL;
    *pcm_samples = 0;
    *sample_rate = 48000; /* OpenAI TTS Opus is always 48kHz */

    /* Allocate output buffer in PSRAM -- start with a reasonable estimate.
     * Opus voice at ~24kbps -> ~1:32 compression ratio for 48kHz 16-bit mono.
     * Estimate: ogg_len * 32 samples, capped at MAX_PCM_SAMPLES. */
    size_t estimated_samples = (ogg_len * 32 > MAX_PCM_SAMPLES)
        ? MAX_PCM_SAMPLES : ogg_len * 32;
    if (estimated_samples < DECODE_CHUNK_SAMPLES) {
        estimated_samples = DECODE_CHUNK_SAMPLES * 4;
    }

    int16_t *pcm_buf = (int16_t *)heap_caps_malloc(
        estimated_samples * sizeof(int16_t), MALLOC_CAP_SPIRAM);
    if (pcm_buf == NULL) {
        ESP_LOGE(TAG, "Failed to allocate PCM buffer (%zu samples) in PSRAM",
                 estimated_samples);
        return -1;
    }

    /* Initialize Ogg Opus decoder */
    OggOpusDecoder *decoder = ogg_opus_decoder_create();
    if (decoder == NULL) {
        ESP_LOGE(TAG, "Failed to create Ogg Opus decoder");
        heap_caps_free(pcm_buf);
        return -1;
    }

    /* Feed the entire Ogg data and decode */
    size_t total_samples = 0;
    size_t offset = 0;
    /* Feed data in chunks to the decoder */
    const size_t feed_chunk = 4096;

    while (offset < ogg_len) {
        size_t remaining = ogg_len - offset;
        size_t chunk = (remaining < feed_chunk) ? remaining : feed_chunk;

        int result = ogg_opus_decoder_feed(decoder, ogg_data + offset, chunk);
        if (result < 0) {
            ESP_LOGE(TAG, "Decoder feed error at offset %zu: %d", offset, result);
            break;
        }
        offset += chunk;

        /* Read decoded PCM samples */
        int decoded;
        do {
            /* Check if we need to grow the buffer */
            if (total_samples + DECODE_CHUNK_SAMPLES > estimated_samples) {
                size_t new_size = estimated_samples * 2;
                if (new_size > MAX_PCM_SAMPLES) new_size = MAX_PCM_SAMPLES;
                if (new_size <= estimated_samples) {
                    ESP_LOGE(TAG, "PCM buffer exhausted at %zu samples", total_samples);
                    break;
                }
                int16_t *new_buf = (int16_t *)heap_caps_realloc(
                    pcm_buf, new_size * sizeof(int16_t), MALLOC_CAP_SPIRAM);
                if (new_buf == NULL) {
                    ESP_LOGE(TAG, "Failed to grow PCM buffer to %zu samples", new_size);
                    break;
                }
                pcm_buf = new_buf;
                estimated_samples = new_size;
            }

            decoded = ogg_opus_decoder_read(
                decoder,
                pcm_buf + total_samples,
                DECODE_CHUNK_SAMPLES);
            if (decoded > 0) {
                total_samples += decoded;
            }
        } while (decoded > 0);
    }

    /* Get sample rate from decoder if available */
    uint32_t rate = ogg_opus_decoder_get_sample_rate(decoder);
    if (rate > 0) {
        *sample_rate = rate;
    }

    ogg_opus_decoder_destroy(decoder);

    if (total_samples == 0) {
        ESP_LOGE(TAG, "No PCM samples decoded from %zu bytes of Ogg Opus", ogg_len);
        heap_caps_free(pcm_buf);
        return -1;
    }

    *pcm_out = pcm_buf;
    *pcm_samples = total_samples;

    ESP_LOGI(TAG, "Opus decoded: %zu samples at %luHz from %zu bytes",
             total_samples, (unsigned long)*sample_rate, ogg_len);

    return 0;
}

void elisa_opus_free(int16_t *pcm_data) {
    if (pcm_data != NULL) {
        heap_caps_free(pcm_data);
    }
}
