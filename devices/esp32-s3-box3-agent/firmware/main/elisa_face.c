/**
 * @file elisa_face.c
 * @brief LVGL face rendering implementation for BOX-3 display.
 *
 * Renders the agent face using LVGL primitives on the 320x240 screen.
 * All shapes are basic geometry (circles, arcs, lines) to keep rendering
 * identical between firmware (LVGL) and browser preview (SVG).
 *
 * ANIMATION TICK:
 * A 30ms LVGL timer drives all animations (blink, pulse, mouth movement).
 * State transitions reset animation counters and start new ones.
 */

#include "elisa_face.h"

#include <math.h>
#include <string.h>

#include "esp_log.h"
#include "esp_random.h"
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
#define BLINK_DURATION  60

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

/* Blink animation state */
static uint32_t s_blink_countdown = 4000; /* ms until next blink */
static bool s_blink_active = false;
static uint32_t s_blink_timer = 0;        /* ms into current blink */

/* Thinking animation state */
static uint32_t s_think_counter = 0;

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
 * - IDLE: periodic blink (hide eyes for ~60ms every 3-5s)
 * - THINKING: pulse mouth opacity (sine wave)
 * - SPEAKING: resize mouth height proportional to s_audio_level
 */
static void anim_timer_cb(lv_timer_t *timer) {
    (void)timer;

    switch (s_state) {
    case FACE_STATE_IDLE:
        /* Blink logic: hide eyes briefly every 3-5 seconds */
        if (s_blink_active) {
            s_blink_timer += ANIM_TICK_MS;
            if (s_blink_timer >= BLINK_DURATION) {
                /* End blink -- show eyes */
                lv_obj_clear_flag(s_eye_left, LV_OBJ_FLAG_HIDDEN);
                lv_obj_clear_flag(s_eye_right, LV_OBJ_FLAG_HIDDEN);
                s_blink_active = false;
                /* Schedule next blink */
                s_blink_countdown = BLINK_MIN_MS +
                    (esp_random() % (BLINK_MAX_MS - BLINK_MIN_MS));
            }
        } else {
            if (s_blink_countdown <= ANIM_TICK_MS) {
                /* Start blink -- hide eyes */
                lv_obj_add_flag(s_eye_left, LV_OBJ_FLAG_HIDDEN);
                lv_obj_add_flag(s_eye_right, LV_OBJ_FLAG_HIDDEN);
                s_blink_active = true;
                s_blink_timer = 0;
            } else {
                s_blink_countdown -= ANIM_TICK_MS;
            }
        }
        break;

    case FACE_STATE_THINKING: {
        /* Pulse mouth opacity with a sine-ish wave (~1Hz cycle) */
        s_think_counter += ANIM_TICK_MS;
        float t = (float)s_think_counter / 1000.0f;
        int opacity = (int)(128.0f + 127.0f * sinf(t * 3.14159f * 2.0f));
        if (opacity < 0) opacity = 0;
        if (opacity > 255) opacity = 255;
        lv_obj_set_style_bg_opa(s_mouth, (lv_opa_t)opacity, 0);
        break;
    }

    case FACE_STATE_SPEAKING: {
        /* Scale mouth height proportional to audio level */
        int base_h = 4;
        int max_h = 24;
        int h = base_h + (int)((float)(max_h - base_h) * s_audio_level);
        lv_obj_set_height(s_mouth, h);
        break;
    }

    default:
        break;
    }
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

    /* Create mouth */
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

    /* Schedule first blink */
    s_blink_countdown = BLINK_MIN_MS + (esp_random() % (BLINK_MAX_MS - BLINK_MIN_MS));

    ESP_LOGI(TAG, "Face initialized: %s eyes=%s mouth=%s",
             s_desc.base_shape, s_desc.eyes.style, s_desc.mouth.style);

    return 0;
}

void elisa_face_set_state(face_state_t state) {
    if (!s_initialized) return;

    face_state_t prev = s_state;
    s_state = state;

    ESP_LOGI(TAG, "Face state: %d -> %d", prev, state);

    /* Reset common state on every transition */
    lv_obj_clear_flag(s_eye_left, LV_OBJ_FLAG_HIDDEN);
    lv_obj_clear_flag(s_eye_right, LV_OBJ_FLAG_HIDDEN);
    lv_obj_set_style_bg_opa(s_mouth, LV_OPA_COVER, 0);
    lv_obj_set_height(s_mouth, 4);
    s_blink_active = false;

    int eye_r = get_eye_radius(s_desc.eyes.size);

    switch (state) {
    case FACE_STATE_IDLE:
        /* Schedule next blink, restore face color and eye size */
        s_blink_countdown = BLINK_MIN_MS +
            (esp_random() % (BLINK_MAX_MS - BLINK_MIN_MS));
        lv_obj_set_style_bg_color(s_face_bg, make_color(s_desc.face_color), 0);
        lv_obj_set_size(s_eye_left, eye_r * 2, eye_r * 2);
        lv_obj_set_size(s_eye_right, eye_r * 2, eye_r * 2);
        break;

    case FACE_STATE_LISTENING:
        /* Widen eyes slightly (+4px) */
        lv_obj_set_size(s_eye_left, eye_r * 2 + 4, eye_r * 2 + 4);
        lv_obj_set_size(s_eye_right, eye_r * 2 + 4, eye_r * 2 + 4);
        break;

    case FACE_STATE_THINKING:
        /* Restore eye size to normal, reset pulse counter */
        lv_obj_set_size(s_eye_left, eye_r * 2, eye_r * 2);
        lv_obj_set_size(s_eye_right, eye_r * 2, eye_r * 2);
        s_think_counter = 0;
        break;

    case FACE_STATE_SPEAKING:
        /* Eyes normal, mouth will be animated in anim_timer_cb */
        lv_obj_set_size(s_eye_left, eye_r * 2, eye_r * 2);
        lv_obj_set_size(s_eye_right, eye_r * 2, eye_r * 2);
        break;

    case FACE_STATE_ERROR:
        /* Change face background to red */
        lv_obj_set_style_bg_color(s_face_bg, lv_color_make(200, 50, 50), 0);
        break;
    }

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
