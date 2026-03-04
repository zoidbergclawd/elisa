/**
 * @file elisa_opus.h
 * @brief Ogg Opus decoder wrapper for ESP32-S3-BOX-3.
 *
 * Wraps the esphome/micro-opus component to decode Ogg Opus audio
 * (from OpenAI TTS) into PCM samples for playback via I2S.
 *
 * Decoded PCM is allocated in PSRAM and must be freed with elisa_opus_free().
 */

#ifndef ELISA_OPUS_H
#define ELISA_OPUS_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Decode Ogg Opus data to PCM int16 samples.
 *
 * Allocates the output buffer in PSRAM. Caller must free with elisa_opus_free().
 * OpenAI TTS returns 48kHz mono Ogg Opus.
 *
 * @param ogg_data    Ogg Opus encoded data
 * @param ogg_len     Length of ogg_data in bytes
 * @param pcm_out     Output: pointer to decoded PCM int16 samples (PSRAM)
 * @param pcm_samples Output: number of PCM samples decoded
 * @param sample_rate Output: sample rate of decoded audio (typically 48000)
 * @return 0 on success, -1 on error
 */
int elisa_opus_decode(const uint8_t *ogg_data, size_t ogg_len,
                      int16_t **pcm_out, size_t *pcm_samples,
                      uint32_t *sample_rate);

/**
 * Free PCM data allocated by elisa_opus_decode().
 * Safe to call with NULL.
 */
void elisa_opus_free(int16_t *pcm_data);

#ifdef __cplusplus
}
#endif

#endif /* ELISA_OPUS_H */
