/**
 * @file elisa_face.c
 * @brief LVGL face rendering implementation for BOX-3 display.
 *
 * Renders the agent face using LVGL primitives on the 320x240 screen.
 * All shapes are basic geometry (circles, arcs, lines) to keep rendering
 * identical between firmware (LVGL) and browser preview (SVG).
 *
 * ADAPTATION NOTES (from chatgpt_demo):
 * - chatgpt_demo's app_ui.c creates a text-based UI with a chat log.
 *   We replace the entire UI with a full-screen animated face.
 * - The chatgpt_demo LVGL setup (display driver, touch driver) is reused
 *   as-is -- only the UI layer changes.
 *
 * SCREEN LAYOUT (320x240):
 * ┌──────────────────────────────┐
 * │                              │
 * │        ┌──────────┐          │
 * │        │  ●    ●  │  eyes    │
 * │        │          │          │
 * │        │   ╰──╯   │  mouth  │
 * │        └──────────┘          │
 * │                              │
 * │     [agent_name]             │
 * │     [status text]            │
 * └──────────────────────────────┘
 *
 * ANIMATION TICK:
 * A 30ms LVGL timer drives all animations (blink, pulse, thinking dots,
 * mouth movement). State transitions cancel running animations and start
 * new ones.
 */

#include "elisa_face.h"

#include <math.h>
#include <string.h>

#include "esp_log.h"
#include "lvgl.h"

static const char *TAG = "elisa_face";

// ── Display Constants ───────────────────────────────────────────────────

#define SCREEN_W    320
#define SCREEN_H    240
#define FACE_CX     (SCREEN_W / 2)   /* Face center X */
#define FACE_CY     (SCREEN_H / 2 - 20) /* Face center Y (shifted up for name) */

/* Eye size lookup (radius in pixels) */
#define EYE_SIZE_SMALL   8
#define EYE_SIZE_MEDIUM  12
#define EYE_SIZE_LARGE   16

/* Eye spacing from center */
#define EYE_SPACING      35

/* Blink interval range (ms) */
#define BLINK_MIN_MS    3000
#define BLINK_MAX_MS    5000
#define BLINK_DURATION  150

/* Animation timer period */
#define ANIM_TICK_MS    30

// ── Static State ────────────────────────────────────────────────────────

static face_descriptor_t s_desc;
static face_state_t s_state = FACE_STATE_IDLE;
static float s_audio_level = 0.0f;
static bool s_initialized = false;

/* LVGL objects */
static lv_obj_t *s_face_bg = NULL;     /* Face background circle/rect */
static lv_obj_t *s_eye_left = NULL;    /* Left eye */
static lv_obj_t *s_eye_right = NULL;   /* Right eye */
static lv_obj_t *s_mouth = NULL;       /* Mouth line/arc */
static lv_obj_t *s_name_label = NULL;  /* Agent name text */
static lv_timer_t *s_anim_timer = NULL; /* Animation tick timer */

// ── Helper: Get eye radius from size string ─────────────────────────────

static int get_eye_radius(const char *size_str) {
    if (strcmp(size_str, "small") == 0) return EYE_SIZE_SMALL;
    if (strcmp(size_str, "large") == 0) return EYE_SIZE_LARGE;
    return EYE_SIZE_MEDIUM;
}

// ── Helper: Create LVGL color from uint32_t RGB ─────────────────────────

static lv_color_t make_color(uint32_t rgb) {
    return lv_color_make((rgb >> 16) & 0xFF, (rgb >> 8) & 0xFF, rgb & 0xFF);
}

// ── Animation Timer Callback ────────────────────────────────────────────

/**
 * Called every ANIM_TICK_MS to update face animations.
 *
 * TODO: Implement per-state animation logic:
 * - IDLE: periodic blink (hide eyes briefly)
 * - LISTENING: pulse ring scale animation
 * - THINKING: bounce three dots sequentially
 * - SPEAKING: scale mouth opening with s_audio_level
 * - ERROR: static sad face (no animation needed)
 */
static void anim_timer_cb(lv_timer_t *timer) {
    (void)timer;

    /* Placeholder: animation logic will be implemented when building
     * with ESP-IDF. Each state manipulates the LVGL objects created
     * in elisa_face_init(). */
}

// ── Public API ──────────────────────────────────────────────────────────

int elisa_face_init(const face_descriptor_t *desc) {
    if (desc != NULL) {
        memcpy(&s_desc, desc, sizeof(s_desc));
    } else {
        /* Defaults matching DEFAULT_FACE from display.ts */
        strncpy(s_desc.base_shape, "round", sizeof(s_desc.base_shape));
        strncpy(s_desc.eyes.style, "circles", sizeof(s_desc.eyes.style));
        strncpy(s_desc.eyes.size, "medium", sizeof(s_desc.eyes.size));
        s_desc.eyes.color = 0x4361ee;
        strncpy(s_desc.mouth.style, "smile", sizeof(s_desc.mouth.style));
        strncpy(s_desc.expression, "happy", sizeof(s_desc.expression));
        s_desc.face_color = 0xf0f0f0;
        s_desc.accent_color = 0xffb3ba;
    }

    lv_obj_t *scr = lv_scr_act();
    if (scr == NULL) {
        ESP_LOGE(TAG, "LVGL screen not available");
        return -1;
    }

    /* Set screen background to black */
    lv_obj_set_style_bg_color(scr, lv_color_black(), 0);

    /*
     * Create face background shape.
     *
     * For "round": circle with radius proportional to screen
     * For "square": rounded rectangle
     * For "oval": ellipse approximated with large border radius
     */
    s_face_bg = lv_obj_create(scr);
    lv_obj_set_size(s_face_bg, 160, 160);
    lv_obj_align(s_face_bg, LV_ALIGN_CENTER, 0, -20);
    lv_obj_set_style_bg_color(s_face_bg, make_color(s_desc.face_color), 0);
    lv_obj_set_style_border_width(s_face_bg, 0, 0);

    if (strcmp(s_desc.base_shape, "round") == 0) {
        lv_obj_set_style_radius(s_face_bg, LV_RADIUS_CIRCLE, 0);
    } else if (strcmp(s_desc.base_shape, "square") == 0) {
        lv_obj_set_style_radius(s_face_bg, 16, 0);
    } else { /* oval */
        lv_obj_set_size(s_face_bg, 140, 170);
        lv_obj_set_style_radius(s_face_bg, LV_RADIUS_CIRCLE, 0);
    }

    /*
     * Create eyes.
     *
     * Style determines shape:
     * - "dots": small filled circles
     * - "circles": outlined circles
     * - "anime": large circles with highlight
     * - "pixels": small squares
     * - "sleepy": half-circles (arcs)
     */
    int eye_r = get_eye_radius(s_desc.eyes.size);
    lv_color_t eye_color = make_color(s_desc.eyes.color);

    s_eye_left = lv_obj_create(s_face_bg);
    lv_obj_set_size(s_eye_left, eye_r * 2, eye_r * 2);
    lv_obj_align(s_eye_left, LV_ALIGN_CENTER, -EYE_SPACING, -15);
    lv_obj_set_style_bg_color(s_eye_left, eye_color, 0);
    lv_obj_set_style_radius(s_eye_left, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_border_width(s_eye_left, 0, 0);

    s_eye_right = lv_obj_create(s_face_bg);
    lv_obj_set_size(s_eye_right, eye_r * 2, eye_r * 2);
    lv_obj_align(s_eye_right, LV_ALIGN_CENTER, EYE_SPACING, -15);
    lv_obj_set_style_bg_color(s_eye_right, eye_color, 0);
    lv_obj_set_style_radius(s_eye_right, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_border_width(s_eye_right, 0, 0);

    /*
     * Create mouth.
     *
     * TODO: implement per-style mouth shapes using lv_line_create():
     * - "line": horizontal line
     * - "smile": upward arc (lv_arc_create)
     * - "zigzag": W-shaped line points
     * - "open": circle/ellipse
     * - "cat": two connected arcs forming a "3" shape
     */
    s_mouth = lv_obj_create(s_face_bg);
    lv_obj_set_size(s_mouth, 40, 4);
    lv_obj_align(s_mouth, LV_ALIGN_CENTER, 0, 25);
    lv_obj_set_style_bg_color(s_mouth, eye_color, 0);
    lv_obj_set_style_radius(s_mouth, 2, 0);
    lv_obj_set_style_border_width(s_mouth, 0, 0);

    /* Start animation timer */
    s_anim_timer = lv_timer_create(anim_timer_cb, ANIM_TICK_MS, NULL);

    s_state = FACE_STATE_IDLE;
    s_initialized = true;

    ESP_LOGI(TAG, "Face initialized: %s eyes=%s mouth=%s",
             s_desc.base_shape, s_desc.eyes.style, s_desc.mouth.style);

    return 0;
}

void elisa_face_set_state(face_state_t state) {
    if (!s_initialized) return;

    face_state_t prev = s_state;
    s_state = state;

    ESP_LOGI(TAG, "Face state: %d -> %d", prev, state);

    /*
     * TODO: Implement state transition animations:
     *
     * IDLE -> LISTENING:  widen eyes, start pulse ring
     * LISTENING -> THINKING: shrink eyes, show dots
     * THINKING -> SPEAKING: remove dots, start mouth anim
     * SPEAKING -> IDLE: reset mouth, start blink timer
     * any -> ERROR: swap colors, sad expression
     */
    (void)prev;
}

face_state_t elisa_face_get_state(void) {
    return s_state;
}

void elisa_face_set_audio_level(float level) {
    /* Clamp to 0.0 - 1.0 */
    if (level < 0.0f) level = 0.0f;
    if (level > 1.0f) level = 1.0f;
    s_audio_level = level;
}

void elisa_face_cleanup(void) {
    if (s_anim_timer != NULL) {
        lv_timer_del(s_anim_timer);
        s_anim_timer = NULL;
    }
    /* LVGL objects are cleaned up when screen is deleted */
    s_initialized = false;
    ESP_LOGI(TAG, "Face renderer cleaned up");
}
