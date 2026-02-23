/**
 * @file sound.h
 * @brief Spatial sound effects for Pong CLI using SDL2_mixer
 *
 * Provides bounce and powerup pickup sounds with stereo panning
 * based on ball/powerup X position, and pitch variation based on
 * ball radius or powerup type.
 */

#ifndef SOUND_H
#define SOUND_H

#include <stdbool.h>

/**
 * Initialize the sound system (SDL2 audio + mixer).
 * Call once at startup. Safe to call if SDL2_mixer is not available
 * — the module will silently disable itself.
 *
 * @param asset_dir  Path to directory containing Bounce1.wav / Pickup3.wav.
 *                   If NULL, tries "./sounds" then the executable directory.
 * @return 0 on success, -1 on failure (sound disabled but app continues).
 */
int     sound_init(const char *asset_dir);

/**
 * Shut down the sound system and free resources.
 */
void    sound_cleanup(void);

/**
 * Play the bounce sound with spatial positioning.
 *
 * @param x       Ball X in game coordinates (0–1000). Controls stereo pan.
 * @param radius  Ball radius. Larger balls → lower pitch, smaller → higher.
 */
void    sound_play_bounce(float x, float radius);

/**
 * Play the powerup pickup sound with spatial positioning and
 * type-specific pitch.
 *
 * @param x     Powerup X in game coordinates (0–1000). Controls stereo pan.
 * @param type  Powerup type (PWRUP_* constants from game.h).
 */
void    sound_play_powerup(float x, int type);

/**
 * Set the master volume (0–100).  Default is 80.
 */
void    sound_set_volume(int volume);

/**
 * Check whether sound is currently enabled and initialized.
 */
bool    sound_is_enabled(void);

#endif /* SOUND_H */
