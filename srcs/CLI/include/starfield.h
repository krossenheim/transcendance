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

/**
 * Initialize a starfield with the given number of stars and speed.
 * @param sf        Starfield to initialize
 * @param count     Number of stars (clamped to STARFIELD_MAX_STARS)
 * @param speed     Movement speed multiplier
 */
void starfield_init(starfield_t *sf, int count, float speed);

/**
 * Update star positions based on elapsed time.
 * @param sf        Starfield to update
 * @param width     Terminal width in columns
 * @param height    Terminal height in rows
 * @param dt        Delta time in seconds since last update
 */
void starfield_update(starfield_t *sf, int width, int height, float dt);

/**
 * Draw the starfield onto an ncurses window.
 * @param sf        Starfield to draw
 * @param win       ncurses window to draw on
 * @param width     Window width in columns
 * @param height    Window height in rows
 */
void starfield_draw(starfield_t *sf, WINDOW *win, int width, int height);

#endif /* STARFIELD_H */
