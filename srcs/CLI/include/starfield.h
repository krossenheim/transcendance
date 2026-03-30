/**
 * @file starfield.h
 * @brief Text-mode starfield effect for Pong CLI
 *
 * Renders a 3D starfield that flies toward the viewer,
 * simulating the classic "warp speed" effect in a terminal.
 */

#ifndef STARFIELD_H
#define STARFIELD_H

#define _XOPEN_SOURCE_EXTENDED 1
#include <ncurses.h>

#define STARFIELD_MAX_STARS 200

typedef struct {
    float x;    /* World-space X coordinate */
    float y;    /* World-space Y coordinate */
    float z;    /* Depth (distance from viewer) */
} star_t;

typedef struct {
    star_t  stars[STARFIELD_MAX_STARS];
    int     count;
    float   speed;      /* Movement speed multiplier */
    float   depth_max;  /* Maximum depth (far plane) */
    float   depth_min;  /* Minimum depth (near plane) */
    float   focal;      /* Focal length for projection */
} starfield_t;

/* Starfield lifecycle */
void starfield_init(starfield_t *sf, int count, float speed);

void starfield_update(starfield_t *sf, int width, int height, float dt);
void starfield_draw(starfield_t *sf, WINDOW *win, int width, int height);

#endif /* STARFIELD_H */
