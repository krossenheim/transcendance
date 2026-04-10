#define _XOPEN_SOURCE_EXTENDED 1
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <time.h>
#include <wchar.h>
#include "starfield.h"

static int g_sf_seeded = 0;
static int g_colors_initialized = 0;

#define STAR_COLOR_BASE 20
#define STAR_COLOR_LEVELS 5

static void init_star_colors(void)
{
    if (g_colors_initialized) return;
    g_colors_initialized = 1;

    if (!has_colors()) return;

    if (COLORS >= 256) {
        int grays[STAR_COLOR_LEVELS] = { 236, 240, 245, 250, 255 };
        for (int i = 0; i < STAR_COLOR_LEVELS; i++)
            init_pair(STAR_COLOR_BASE + i, grays[i], -1);
    } else {
        init_pair(STAR_COLOR_BASE + 0, COLOR_BLACK, -1);
        init_pair(STAR_COLOR_BASE + 1, COLOR_BLUE, -1);
        init_pair(STAR_COLOR_BASE + 2, COLOR_CYAN, -1);
        init_pair(STAR_COLOR_BASE + 3, COLOR_WHITE, -1);
        init_pair(STAR_COLOR_BASE + 4, COLOR_WHITE, -1);
    }
}

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

static void reset_star(star_t *s, int w, int h)
{
    s->x = (randf() - 0.5f) * (float)w * 2.0f;
    s->y = (randf() - 0.5f) * (float)h * 4.0f;
}

void starfield_init(starfield_t *sf, int count, float speed)
{
    if (count > STARFIELD_MAX_STARS)
        count = STARFIELD_MAX_STARS;

    memset(sf, 0, sizeof(*sf));
    sf->count     = count;
    sf->speed     = speed;
    sf->depth_max = 2000.0f;
    sf->depth_min = 80.0f;
    sf->focal     = 300.0f;

    init_star_colors();

    for (int i = 0; i < count; i++) {
        reset_star(&sf->stars[i], 120, 40);
        sf->stars[i].z = randf() * sf->depth_max;
        if (sf->stars[i].z < sf->depth_min)
            sf->stars[i].z = sf->depth_min + 1.0f;
    }
}

void starfield_update(starfield_t *sf, int width, int height, float dt)
{
    float move = sf->speed * dt * 60.0f;

    for (int i = 0; i < sf->count; i++) {
        sf->stars[i].z -= move;
        if (sf->stars[i].z < sf->depth_min) {
            reset_star(&sf->stars[i], width, height);
            sf->stars[i].z = sf->depth_max;
        }
    }
}

static void put_wch(WINDOW *win, int y, int x, wchar_t ch, int color_pair, int attr)
{
    cchar_t cc;
    wchar_t wc[2] = { ch, 0 };
    setcchar(&cc, wc, attr, color_pair, NULL);
    mvwadd_wch(win, y, x, &cc);
}

static void draw_block(WINDOW *win, int sy, int sx, int size, int w, int h,
                       int color_pair, int attr)
{
    int cols = size * 2;
    for (int dy = 0; dy < size; dy++) {
        for (int dx = 0; dx < cols; dx++) {
            int py = sy + dy;
            int px = sx + dx;
            if (px >= 0 && px < w && py >= 0 && py < h) {
                put_wch(win, py, px, 0x2588, color_pair, attr);
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

        float f  = sf->focal / s->z;
        int   sx = (int)roundf(s->x * f + cx);
        int   sy = (int)roundf(s->y * f * 0.5f + cy);

        if (sx < 0 || sx >= w || sy < 0 || sy >= h)
            continue;

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

        if (brightness > 0.80f) {
            draw_block(win, sy, sx, 2, w, h, cpair, attr);
        } else if (brightness > 0.60f) {
            put_wch(win, sy, sx, 0x2588, cpair, attr);
        } else if (brightness > 0.45f) {
            put_wch(win, sy, sx, 0x25AA, cpair, attr);
        } else if (brightness > 0.30f) {
            put_wch(win, sy, sx, 0x2022, cpair, attr);
        } else if (brightness > 0.15f) {
            put_wch(win, sy, sx, 0x2219, cpair, attr);
        } else {
            wattron(win, COLOR_PAIR(cpair) | attr);
            mvwaddch(win, sy, sx, '.');
            wattroff(win, COLOR_PAIR(cpair) | attr);
        }
    }
}
