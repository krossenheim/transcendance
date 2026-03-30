#ifndef STARFIELD_H
#define STARFIELD_H

#define _XOPEN_SOURCE_EXTENDED 1
#include <ncurses.h>

#define STARFIELD_MAX_STARS 200

typedef struct {
    float x;
    float y;
    float z;
} star_t;

typedef struct {
    star_t  stars[STARFIELD_MAX_STARS];
    int     count;
    float   speed;
    float   depth_max;
    float   depth_min;
    float   focal;
} starfield_t;

void starfield_init(starfield_t *sf, int count, float speed);

void starfield_update(starfield_t *sf, int width, int height, float dt);
void starfield_draw(starfield_t *sf, WINDOW *win, int width, int height);

#endif /* STARFIELD_H */
