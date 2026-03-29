/**
 * @file starfield.c
 * @brief Text-mode starfield effect implementation
 *
 * Faithful terminal adaptation of StarfieldBackground.tsx.
 * Stars fly toward the viewer from a vanishing point at screen center.
 * Closer stars appear brighter and are drawn as larger character blocks.
 */

#define _XOPEN_SOURCE_EXTENDED 1
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <time.h>
#include <wchar.h>
#include "starfield.h"

static int g_sf_seeded = 0;
static int g_colors_initialized = 0;

/* Star color pairs — 5 levels from dark to bright (IDs 20-24) */
#define STAR_COLOR_BASE 20
#define STAR_COLOR_LEVELS 5

static void init_star_colors(void)
{
    if (g_colors_initialized) return;
    g_colors_initialized = 1;

    if (!has_colors()) return;

    if (COLORS >= 256) {
        /* 256-color terminal: use actual gray ramp (232-255) */
        /* Gray indices: 232=black ... 255=white, pick 5 spread out */
        int grays[STAR_COLOR_LEVELS] = { 236, 240, 245, 250, 255 };
        for (int i = 0; i < STAR_COLOR_LEVELS; i++)
            init_pair(STAR_COLOR_BASE + i, grays[i], -1);
    } else {
        /* 8-color fallback: dark→bright using available colors */
        init_pair(STAR_COLOR_BASE + 0, COLOR_BLACK, -1);    /* dimmest */
        init_pair(STAR_COLOR_BASE + 1, COLOR_BLUE, -1);
        init_pair(STAR_COLOR_BASE + 2, COLOR_CYAN, -1);
        init_pair(STAR_COLOR_BASE + 3, COLOR_WHITE, -1);
        init_pair(STAR_COLOR_BASE + 4, COLOR_WHITE, -1);    /* brightest */
    }
}

/* Get color pair index for a given brightness (0.0 = far/dark, 1.0 = close/bright) */
static int star_color(float brightness)
{
    int level = (int)(brightness * (float)STAR_COLOR_LEVELS);
    if (level < 0) level = 0;
    if (level >= STAR_COLOR_LEVELS) level = STAR_COLOR_LEVELS - 1;
    return STAR_COLOR_BASE + level;
}

static float randf(void)
{
    if (!g_sf_seeded) {
        srand((unsigned)time(NULL));
        g_sf_seeded = 1;
    }
    return (float)rand() / (float)RAND_MAX;
}

/* Reset a star to a random far position — matches original spawn logic:
 *   x = (random - 0.5) * W * 2     →  range [-W, W]
 *   y = (random - 0.5) * H * 2     →  range [-H, H]
 *   z = depthStart                  (or random * depthStart for initial fill)
 */
static void reset_star(star_t *s, int w, int h)
{
    s->x = (randf() - 0.5f) * (float)w * 2.0f;
    /* Y projection is halved (× 0.5) to compensate for tall terminal
     * cells, so double the spawn range to keep vertical spread even. */
    s->y = (randf() - 0.5f) * (float)h * 4.0f;
}

void starfield_init(starfield_t *sf, int count, float speed)
{
    if (count > STARFIELD_MAX_STARS)
        count = STARFIELD_MAX_STARS;

    memset(sf, 0, sizeof(*sf));
    sf->count     = count;
    sf->speed     = speed;
    sf->depth_max = 2000.0f;   /* Match original depthStart */
    sf->depth_min = 80.0f;    /* Recycle before stars linger at max size */
    sf->focal     = 300.0f;   /* Match original focal       */

    init_star_colors();

    /* Scatter stars at random depths for initial fill */
    for (int i = 0; i < count; i++) {
        reset_star(&sf->stars[i], 120, 40);
        sf->stars[i].z = randf() * sf->depth_max;
        if (sf->stars[i].z < sf->depth_min)
            sf->stars[i].z = sf->depth_min + 1.0f;
    }
}

void starfield_update(starfield_t *sf, int width, int height, float dt)
{
    /* Original runs at ~60fps with speed subtracted each frame.
     * Scale to match: move = speed * dt * 60  */
    float move = sf->speed * dt * 60.0f;

    for (int i = 0; i < sf->count; i++) {
        sf->stars[i].z -= move;
        if (sf->stars[i].z < sf->depth_min) {
            reset_star(&sf->stars[i], width, height);
            sf->stars[i].z = sf->depth_max;
        }
    }
}

/* Place a wide character with color + attribute */
static void put_wch(WINDOW *win, int y, int x, wchar_t ch, int color_pair, int attr)
{
    cchar_t cc;
    wchar_t wc[2] = { ch, 0 };
    setcchar(&cc, wc, attr, color_pair, NULL);
    mvwadd_wch(win, y, x, &cc);
}

/* Draw a filled rectangle of full-block characters.
 * Terminal chars are ~2x taller than wide, so we double the
 * horizontal extent to make the block appear square.          */
static void draw_block(WINDOW *win, int sy, int sx, int size, int w, int h,
                       int color_pair, int attr)
{
    int cols = size * 2;  /* widen to compensate for tall cells */
    for (int dy = 0; dy < size; dy++) {
        for (int dx = 0; dx < cols; dx++) {
            int py = sy + dy;
            int px = sx + dx;
            if (px >= 0 && px < w && py >= 0 && py < h) {
                put_wch(win, py, px, 0x2588, color_pair, attr); /* █ */
            }
        }
    }
}

void starfield_draw(starfield_t *sf, WINDOW *win, int w, int h)
{
    float cx = (float)w  / 2.0f;
    float cy = (float)h  / 2.0f;

    for (int i = 0; i < sf->count; i++) {
        const star_t *s = &sf->stars[i];

        /* Perspective projection — identical to original: f = 300 / z */
        float f  = sf->focal / s->z;
        int   sx = (int)roundf(s->x * f + cx);
        /* Terminal chars are ~2x taller than wide, so halve Y projection */
        int   sy = (int)roundf(s->y * f * 0.5f + cy);

        if (sx < 0 || sx >= w || sy < 0 || sy >= h)
            continue;

        /* Brightness: 0 (far) to 1 (close) — matches original */
        float brightness = 1.0f - s->z / sf->depth_max;
        if (brightness < 0.0f) brightness = 0.0f;
        if (brightness > 1.0f) brightness = 1.0f;

        int cpair = star_color(brightness);
        int attr;
        if (brightness < 0.25f)
            attr = A_DIM;
        else if (brightness < 0.6f)
            attr = A_NORMAL;
        else
            attr = A_BOLD;

        /* Size based on brightness so growth is visible across the
         * full depth range, not just the last 10%:
         *
         *   Brightness   Size   Visual
         *   ──────────   ────   ──────────────────
         *   0.00–0.15    .      tiny period
         *   0.15–0.30    ∙      small dot   (U+2219)
         *   0.30–0.45    •      bullet      (U+2022)
         *   0.45–0.60    ▪      sm square   (U+25AA)
         *   0.60–0.80    █      full block  (U+2588)
         *   0.80–1.00    ██     2×2 blocks
         */
        if (brightness > 0.80f) {
            draw_block(win, sy, sx, 2, w, h, cpair, attr);
        } else if (brightness > 0.60f) {
            put_wch(win, sy, sx, 0x2588, cpair, attr);  /* █ */
        } else if (brightness > 0.45f) {
            put_wch(win, sy, sx, 0x25AA, cpair, attr);  /* ▪ */
        } else if (brightness > 0.30f) {
            put_wch(win, sy, sx, 0x2022, cpair, attr);  /* • */
        } else if (brightness > 0.15f) {
            put_wch(win, sy, sx, 0x2219, cpair, attr);  /* ∙ */
        } else {
            wattron(win, COLOR_PAIR(cpair) | attr);
            mvwaddch(win, sy, sx, '.');
            wattroff(win, COLOR_PAIR(cpair) | attr);
        }
    }
}
