/**
 * @file elisa_wake_word.cc
 * @brief TFLite Micro wake word detector for "Hi Roo".
 *
 * Uses the microWakeWord-trained MixedNet model with streaming inference.
 * Audio features: 40-channel mel spectrogram via ESPMicroSpeechFeatures
 * (matching the microWakeWord training pipeline exactly).
 *
 * Based on the micro_wake_word implementation from ESPHome, adapted for
 * direct integration with the ESP32-S3-BOX-3 chatgpt_demo audio pipeline.
 */

#include "elisa_wake_word.h"

#include <cstring>
#include <cstdlib>

#include "esp_log.h"
#include "esp_heap_caps.h"

/* TFLite Micro */
#include "tensorflow/lite/micro/micro_interpreter.h"
#include "tensorflow/lite/micro/micro_mutable_op_resolver.h"
#include "tensorflow/lite/micro/micro_resource_variable.h"
#include "tensorflow/lite/schema/schema_generated.h"

/* Audio feature extraction (matches microWakeWord training pipeline) */
extern "C" {
#include "frontend.h"
#include "frontend_util.h"
}

/* Embedded model */
#include "hi_roo_model.h"

static const char *TAG = "wake_word";

// ── Configuration ───────────────────────────────────────────────────────

static constexpr int kSampleRate = 16000;
static constexpr int kFeatureCount = 40;          // mel filterbank channels
static constexpr int kStrideSizeMs = 10;
static constexpr int kStrideSamples = kSampleRate * kStrideSizeMs / 1000;  // 160
static constexpr int kModelInputFrames = 3;       // model expects 3 frames per inference
static constexpr float kProbabilityCutoff = 0.94f; // from training ROC curve
static constexpr int kSlidingWindowSize = 5;       // frames to average
static constexpr int kMinSlicesBeforeDetect = 74;  // ~740ms minimum before detection
static constexpr int kTensorArenaSize = 65536;     // bytes for TFLite arena
static constexpr int kNumResourceVariables = 6;    // streaming state ring buffers

// ── Audio Frontend State ────────────────────────────────────────────────

static struct FrontendState s_frontend_state;
static bool s_frontend_initialized = false;

// ── TFLite State ────────────────────────────────────────────────────────

static uint8_t *s_tensor_arena = nullptr;
static tflite::MicroInterpreter *s_interpreter = nullptr;
static TfLiteTensor *s_input_tensor = nullptr;
static TfLiteTensor *s_output_tensor = nullptr;

// Feature ring buffer: accumulates kModelInputFrames spectrograms
static int8_t s_feature_buffer[kModelInputFrames * kFeatureCount];
static int s_feature_write_idx = 0;
static int s_features_generated = 0;

// Audio accumulation buffer for stride
static int16_t s_audio_buffer[512];  // enough for 30ms window at 16kHz
static int s_audio_buffer_len = 0;

// Sliding window for probability smoothing
static float s_prob_window[kSlidingWindowSize];
static int s_prob_idx = 0;
static int s_slices_since_reset = 0;

// ── Audio Frontend Init ─────────────────────────────────────────────────

static int init_frontend(void) {
    struct FrontendConfig config;

    // Match microWakeWord training pipeline exactly
    config.window.size_ms = 30;
    config.window.step_size_ms = kStrideSizeMs;
    config.filterbank.num_channels = kFeatureCount;
    config.filterbank.lower_band_limit = 125.0f;
    config.filterbank.upper_band_limit = 7500.0f;
    config.noise_reduction.smoothing_bits = 10;
    config.noise_reduction.even_smoothing = 0.025f;
    config.noise_reduction.odd_smoothing = 0.06f;
    config.noise_reduction.min_signal_remaining = 0.05f;
    config.pcan_gain_control.enable_pcan = 1;
    config.pcan_gain_control.strength = 0.95f;
    config.pcan_gain_control.offset = 80.0f;
    config.pcan_gain_control.gain_bits = 21;
    config.log_scale.enable_log = 1;
    config.log_scale.scale_shift = 6;

    if (!FrontendPopulateState(&config, &s_frontend_state, kSampleRate)) {
        ESP_LOGE(TAG, "FrontendPopulateState failed");
        return -1;
    }

    FrontendReset(&s_frontend_state);
    s_frontend_initialized = true;
    ESP_LOGI(TAG, "Audio frontend initialized (40ch mel, 30ms/10ms, PCAN)");
    return 0;
}

// ── Public API ──────────────────────────────────────────────────────────

extern "C" int elisa_wake_word_init(void) {
    ESP_LOGI(TAG, "Initializing TFLite wake word detector (Hi Roo)");

    // Initialize audio feature extraction
    if (init_frontend() != 0) {
        return -1;
    }

    // Allocate tensor arena in PSRAM
    s_tensor_arena = (uint8_t *)heap_caps_malloc(kTensorArenaSize, MALLOC_CAP_SPIRAM);
    if (!s_tensor_arena) {
        ESP_LOGE(TAG, "Failed to allocate tensor arena (%d bytes)", kTensorArenaSize);
        return -1;
    }

    // Load model
    const tflite::Model *model = tflite::GetModel(hi_roo_model);
    if (model->version() != TFLITE_SCHEMA_VERSION) {
        ESP_LOGE(TAG, "Model schema version mismatch: got %lu, expected %d",
                 model->version(), TFLITE_SCHEMA_VERSION);
        return -1;
    }

    // Register the exact 13 ops used by the Hi Roo streaming model
    static tflite::MicroMutableOpResolver<13> resolver;
    resolver.AddConv2D();
    resolver.AddDepthwiseConv2D();
    resolver.AddFullyConnected();
    resolver.AddReshape();
    resolver.AddLogistic();
    resolver.AddQuantize();
    resolver.AddStridedSlice();
    resolver.AddConcatenation();
    resolver.AddSplitV();
    resolver.AddVarHandle();
    resolver.AddReadVariable();
    resolver.AddAssignVariable();
    resolver.AddCallOnce();

    // Allocate resource variables for streaming state on a separate arena
    static uint8_t rv_arena[1024];
    tflite::MicroAllocator *rv_allocator = tflite::MicroAllocator::Create(
        rv_arena, sizeof(rv_arena));
    tflite::MicroResourceVariables *resource_vars = nullptr;
    if (rv_allocator) {
        resource_vars = tflite::MicroResourceVariables::Create(
            rv_allocator, kNumResourceVariables);
    }
    if (!resource_vars) {
        ESP_LOGE(TAG, "Failed to create MicroResourceVariables");
        return -1;
    }

    // Create interpreter
    static tflite::MicroInterpreter static_interpreter(model, resolver,
                                                        s_tensor_arena, kTensorArenaSize,
                                                        resource_vars);
    s_interpreter = &static_interpreter;

    if (s_interpreter->AllocateTensors() != kTfLiteOk) {
        ESP_LOGE(TAG, "AllocateTensors() failed");
        return -1;
    }

    s_input_tensor = s_interpreter->input(0);
    s_output_tensor = s_interpreter->output(0);

    ESP_LOGI(TAG, "Model loaded: input shape [%d,%d,%d], output shape [%d,%d]",
             s_input_tensor->dims->data[0],
             s_input_tensor->dims->data[1],
             s_input_tensor->dims->data[2],
             s_output_tensor->dims->data[0],
             s_output_tensor->dims->data[1]);

    elisa_wake_word_reset();

    ESP_LOGI(TAG, "Wake word detector ready (cutoff=%.2f, window=%d)",
             kProbabilityCutoff, kSlidingWindowSize);
    return 0;
}

extern "C" bool elisa_wake_word_detect(const int16_t *audio, size_t samples) {
    if (!s_frontend_initialized || !s_interpreter) return false;

    // Accumulate audio samples
    for (size_t i = 0; i < samples; i++) {
        s_audio_buffer[s_audio_buffer_len++] = audio[i];

        if (s_audio_buffer_len >= kStrideSamples) {
            // Extract mel spectrogram features via ESPMicroSpeechFeatures
            size_t num_samples_read = 0;
            struct FrontendOutput frontend_output = FrontendProcessSamples(
                &s_frontend_state,
                s_audio_buffer,
                s_audio_buffer_len,
                &num_samples_read);

            if (frontend_output.values != nullptr && frontend_output.size == kFeatureCount) {
                // Quantize uint16 features to int8 (matching micro_wake_word pipeline)
                // Formula: value = ((feature * 256) + 333) / 666 - 128
                int write_offset = s_feature_write_idx * kFeatureCount;
                for (size_t f = 0; f < frontend_output.size; f++) {
                    int32_t value = ((int32_t)frontend_output.values[f] * 256 + 333) / 666;
                    value -= 128;
                    if (value < -128) value = -128;
                    if (value > 127) value = 127;
                    s_feature_buffer[write_offset + f] = (int8_t)value;
                }

                s_feature_write_idx = (s_feature_write_idx + 1) % kModelInputFrames;
                s_features_generated++;
            }

            // Shift remaining samples (if frontend didn't consume all)
            if (num_samples_read > 0 && num_samples_read < (size_t)s_audio_buffer_len) {
                int remaining = s_audio_buffer_len - (int)num_samples_read;
                memmove(s_audio_buffer, s_audio_buffer + num_samples_read,
                        remaining * sizeof(int16_t));
                s_audio_buffer_len = remaining;
            } else {
                s_audio_buffer_len = 0;
            }

            // Run inference when we have enough feature frames
            if (s_features_generated >= kModelInputFrames) {
                // Copy features to input tensor in ring buffer order
                int8_t *input_data = s_input_tensor->data.int8;
                for (int f = 0; f < kModelInputFrames; f++) {
                    int src_idx = ((s_feature_write_idx + f) % kModelInputFrames) * kFeatureCount;
                    memcpy(input_data + f * kFeatureCount,
                           s_feature_buffer + src_idx,
                           kFeatureCount);
                }

                if (s_interpreter->Invoke() != kTfLiteOk) {
                    ESP_LOGE(TAG, "Invoke() failed");
                    continue;
                }

                // Get probability (output is uint8, scale to 0.0-1.0)
                uint8_t raw_output = s_output_tensor->data.uint8[0];
                float probability = raw_output / 255.0f;

                // Update sliding window
                s_prob_window[s_prob_idx] = probability;
                s_prob_idx = (s_prob_idx + 1) % kSlidingWindowSize;
                s_slices_since_reset++;

                // Check detection
                if (s_slices_since_reset >= kMinSlicesBeforeDetect) {
                    float sum = 0.0f;
                    for (int w = 0; w < kSlidingWindowSize; w++) {
                        sum += s_prob_window[w];
                    }
                    float mean_prob = sum / kSlidingWindowSize;

                    if (mean_prob >= kProbabilityCutoff) {
                        ESP_LOGI(TAG, "Wake word detected! prob=%.3f", mean_prob);
                        return true;
                    }
                }
            }
        }
    }

    return false;
}

extern "C" void elisa_wake_word_reset(void) {
    memset(s_feature_buffer, 0, sizeof(s_feature_buffer));
    memset(s_prob_window, 0, sizeof(s_prob_window));
    memset(s_audio_buffer, 0, sizeof(s_audio_buffer));
    s_feature_write_idx = 0;
    s_features_generated = 0;
    s_audio_buffer_len = 0;
    s_prob_idx = 0;
    s_slices_since_reset = 0;
    if (s_frontend_initialized) {
        FrontendReset(&s_frontend_state);
    }
}

extern "C" void elisa_wake_word_cleanup(void) {
    if (s_frontend_initialized) {
        FrontendFreeStateContents(&s_frontend_state);
        s_frontend_initialized = false;
    }
    if (s_tensor_arena) {
        heap_caps_free(s_tensor_arena);
        s_tensor_arena = nullptr;
    }
    s_interpreter = nullptr;
    s_input_tensor = nullptr;
    s_output_tensor = nullptr;
}
