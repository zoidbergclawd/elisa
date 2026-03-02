/**
 * @file elisa_face.h
 * @brief LVGL face rendering for Elisa agent avatar on BOX-3 display.
 *
 * Renders a parameterized face on the 320x240 IPS touchscreen using LVGL
 * drawing primitives. The face design is driven by FaceDescriptor JSON
 * from the runtime config, supporting ~50 meaningful style combinations.
 *
 * ADAPTATION NOTES (from chatgpt_demo):
 * - chatgpt_demo uses a static UI with text display (app_ui.c).
 *   We replace it with an animated face that reflects the agent's state:
 *   idle (slow blink), listening (wide eyes + pulse), thinking (dots),
 *   speaking (mouth animation synced to audio amplitude).
 * - The face is built from basic geometric shapes (arcs, circles, lines)
 *   that are deliberately renderable on both LVGL (firmware) and SVG
 *   (browser preview in AgentStudioCanvas).
 *
 * LVGL PRIMITIVES USED:
 * - lv_obj_create()   -- face background container
 * - lv_arc_create()   -- round/oval face outline
 * - lv_obj_set_style_bg_color() -- face/eye colors
 * - lv_line_create()  -- mouth shapes (line, zigzag, cat)
 * - lv_anim_create()  -- blink, pulse, thinking animations
 * - lv_timer_create() -- animation tick driver
 *
 * DEPENDENCIES:
 * - LVGL (v8.x, bundled with esp-box BSP)
 * - elisa_config.h (face_descriptor_t, face_state_t)
 */

#ifndef ELISA_FACE_H
#define ELISA_FACE_H

#include "elisa_config.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Initialize the face renderer with a parsed FaceDescriptor.
 *
 * Creates LVGL objects for the face background, eyes, mouth, and
 * accent elements (cheeks for some expressions). Call after LVGL
 * and the display driver are initialized.
 *
 * @param desc Parsed face descriptor from config (or NULL for defaults)
 * @return 0 on success, -1 if LVGL is not initialized
 */
int elisa_face_init(const face_descriptor_t *desc);

/**
 * Set the face animation state.
 *
 * Transitions the face to the given state with appropriate animations:
 *
 * - FACE_STATE_IDLE:      Slow periodic blink (eyes close briefly every 3-5s).
 *                         Mouth in resting position. Gentle color pulse on accent.
 *
 * - FACE_STATE_LISTENING: Eyes widen (size increases). A pulsing ring appears
 *                         around the face. Mouth slightly open.
 *
 * - FACE_STATE_THINKING:  Eyes look up/down (animate Y offset). Three dots
 *                         appear below the face with a sequential bounce.
 *
 * - FACE_STATE_SPEAKING:  Mouth animates based on audio amplitude (set via
 *                         elisa_face_set_audio_level). Eyes in normal state.
 *
 * - FACE_STATE_ERROR:     Sad expression (eyes droop, mouth frowns).
 *                         Accent color changes to red.
 *
 * @param state Target animation state
 */
void elisa_face_set_state(face_state_t state);

/**
 * Get the current face animation state.
 */
face_state_t elisa_face_get_state(void);

/**
 * Set audio amplitude level for speaking animation.
 *
 * During FACE_STATE_SPEAKING, the mouth opening scales with the
 * audio level. Call this from the I2S playback callback.
 *
 * @param level Audio amplitude 0.0 (silent) to 1.0 (max)
 */
void elisa_face_set_audio_level(float level);

/**
 * Clean up face renderer resources. Call before shutdown.
 */
void elisa_face_cleanup(void);

#ifdef __cplusplus
}
#endif

#endif /* ELISA_FACE_H */
