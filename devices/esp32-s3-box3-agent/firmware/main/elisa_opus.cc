/**
 * @file elisa_opus.cc
 * @brief Ogg Opus decoder wrapper using esphome/micro-opus.
 *
 * Decodes Ogg Opus audio (from OpenAI TTS response_format: 'opus') into
 * PCM int16 samples suitable for playback via I2S on the ES8311 codec.
 *
 * The micro-opus component provides OggOpusDecoder (C++ class) with Xtensa
 * DSP optimizations and PSRAM support.
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
#include "micro_opus/ogg_opus_decoder.h"

using namespace micro_opus;

static const char *TAG = "elisa_opus";

/** Maximum decoded PCM size: 60 seconds of 48kHz mono (5.5 MB in PSRAM). */
#define MAX_PCM_SAMPLES (48000 * 60)

/** Decode output buffer: 120ms of 48kHz mono = 5760 samples = 11520 bytes. */
#define DECODE_OUTPUT_BYTES (5760 * 2)

extern "C" int elisa_opus_decode(const uint8_t *ogg_data, size_t ogg_len,
                                  int16_t **pcm_out, size_t *pcm_samples,
                                  uint32_t *sample_rate) {
    if (ogg_data == NULL || ogg_len == 0 || pcm_out == NULL ||
        pcm_samples == NULL || sample_rate == NULL) {
        return -1;
    }

    *pcm_out = NULL;
    *pcm_samples = 0;
    *sample_rate = 48000; /* OpenAI TTS Opus is always 48kHz */

    /* Allocate output buffer in PSRAM */
    size_t estimated_samples = (ogg_len * 32 > MAX_PCM_SAMPLES)
        ? MAX_PCM_SAMPLES : ogg_len * 32;
    if (estimated_samples < 5760 * 4) {
        estimated_samples = 5760 * 4;
    }

    int16_t *pcm_buf = (int16_t *)heap_caps_malloc(
        estimated_samples * sizeof(int16_t), MALLOC_CAP_SPIRAM);
    if (pcm_buf == NULL) {
        ESP_LOGE(TAG, "Failed to allocate PCM buffer (%zu samples) in PSRAM",
                 estimated_samples);
        return -1;
    }

    /* Create decoder (no CRC, 48kHz, mono) */
    OggOpusDecoder decoder(false, 48000, 1);

    /* Temporary output buffer for each decode call */
    uint8_t *decode_buf = (uint8_t *)heap_caps_malloc(DECODE_OUTPUT_BYTES, MALLOC_CAP_SPIRAM);
    if (decode_buf == NULL) {
        ESP_LOGE(TAG, "Failed to allocate decode buffer");
        heap_caps_free(pcm_buf);
        return -1;
    }

    size_t total_samples = 0;
    size_t input_offset = 0;

    while (input_offset < ogg_len) {
        size_t bytes_consumed = 0;
        size_t samples_decoded = 0;

        OggOpusResult result = decoder.decode(
            ogg_data + input_offset,
            ogg_len - input_offset,
            decode_buf,
            DECODE_OUTPUT_BYTES,
            bytes_consumed,
            samples_decoded);

        if (bytes_consumed > 0) {
            input_offset += bytes_consumed;
        }

        if (samples_decoded > 0) {
            /* Check if we need to grow the buffer */
            if (total_samples + samples_decoded > estimated_samples) {
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

            /* Copy decoded samples (int16 LE) to output buffer */
            memcpy(pcm_buf + total_samples, decode_buf, samples_decoded * sizeof(int16_t));
            total_samples += samples_decoded;
        }

        if (result != OGG_OPUS_OK) {
            ESP_LOGE(TAG, "Decode error: %d at offset %zu", (int)result, input_offset);
            break;
        }

        /* End of stream: no bytes consumed and no samples decoded */
        if (bytes_consumed == 0 && samples_decoded == 0) {
            break;
        }
    }

    heap_caps_free(decode_buf);

    /* Get sample rate from decoder */
    uint32_t rate = decoder.get_sample_rate();
    if (rate > 0) {
        *sample_rate = rate;
    }

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

extern "C" void elisa_opus_free(int16_t *pcm_data) {
    if (pcm_data != NULL) {
        heap_caps_free(pcm_data);
    }
}
