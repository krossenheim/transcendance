/**
 * @file sound.c
 * @brief Spatial sound implementation using SDL2_mixer
 *
 * Bounce sounds pan left/right by ball X and pitch-shift by ball radius.
 * Powerup sounds pan by X and pitch-shift by powerup type.
 *
 * SDL2_mixer doesn't support real-time pitch shifting, so we pre-generate
 * a few pitch variants of each WAV by resampling the raw PCM buffer at
 * load time. At play time we pick the closest variant and set stereo
 * panning via Mix_SetPanning().
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <SDL2/SDL.h>
#include <SDL2/SDL_mixer.h>
#include "sound.h"
#include "game.h"

/* ---- constants -------------------------------------------------------- */

#define BOUNCE_CHANNEL  0       /* dedicated mixer channel for bounce      */
#define POWERUP_CHANNEL 1       /* dedicated mixer channel for powerup     */
#define NUM_CHANNELS    4       /* total mixer channels                    */

/* Pitch rates for powerup types (same values as web frontend) */
static const float POWERUP_RATES[] = {
    [PWRUP_ADD_BALL]              = 1.00f,
    [PWRUP_INCREASE_PADDLE_SPEED] = 1.25f,
    [PWRUP_DECREASE_PADDLE_SPEED] = 0.80f,
    [PWRUP_SUPER_SPEED]           = 1.50f,
    [PWRUP_INCREASE_BALL_SIZE]    = 0.67f,
    [PWRUP_DECREASE_BALL_SIZE]    = 1.80f,
    [PWRUP_REVERSE_CONTROLS]      = 0.55f,
};
#define NUM_POWERUP_TYPES 7

/* Number of pre-generated pitch variants per sound */
#define NUM_PITCH_VARIANTS 12
/* Pitch range: 0.5x – 2.0x  (evenly spaced in log space) */
#define PITCH_MIN 0.5f
#define PITCH_MAX 2.0f

/* ---- module state ----------------------------------------------------- */

typedef struct {
    Mix_Chunk *variants[NUM_PITCH_VARIANTS];
    float      rates[NUM_PITCH_VARIANTS];
} pitched_sound_t;

static bool             g_enabled = false;
static int              g_volume  = 80;           /* 0-100 */
static pitched_sound_t  g_bounce  = {0};
static pitched_sound_t  g_powerup = {0};

/* ---- helpers ---------------------------------------------------------- */

/**
 * Resample a signed-16-bit mono/stereo buffer by @p rate.
 * rate < 1 → lower pitch (longer), rate > 1 → higher pitch (shorter).
 * Returns a new Mix_Chunk or NULL.
 */
static Mix_Chunk *resample_chunk(Mix_Chunk *src, float rate)
{
    if (!src || rate <= 0.01f) return NULL;

    /* src->alen is in bytes.  Assume 16-bit signed samples. */
    int sample_bytes  = 2;  /* Sint16 */
    int src_samples   = (int)(src->alen / sample_bytes);
    int dst_samples   = (int)(src_samples / rate);
    if (dst_samples < 1) dst_samples = 1;

    Uint32 dst_len = (Uint32)(dst_samples * sample_bytes);
    Uint8 *buf = malloc(dst_len);
    if (!buf) return NULL;

    Sint16 *s = (Sint16 *)src->abuf;
    Sint16 *d = (Sint16 *)buf;

    for (int i = 0; i < dst_samples; i++) {
        float src_idx = i * rate;
        int   idx     = (int)src_idx;
        float frac    = src_idx - idx;
        if (idx >= src_samples - 1) idx = src_samples - 2;
        if (idx < 0) idx = 0;
        float val = s[idx] * (1.0f - frac) + s[idx + 1] * frac;
        if (val >  32767.0f) val =  32767.0f;
        if (val < -32768.0f) val = -32768.0f;
        d[i] = (Sint16)val;
    }

    Mix_Chunk *chunk = malloc(sizeof(Mix_Chunk));
    if (!chunk) { free(buf); return NULL; }
    chunk->allocated = 1;
    chunk->abuf      = buf;
    chunk->alen      = dst_len;
    chunk->volume    = MIX_MAX_VOLUME;
    return chunk;
}

/**
 * Build the pre-generated pitch variants for a base WAV file.
 */
static int build_variants(const char *path, pitched_sound_t *out)
{
    Mix_Chunk *base = Mix_LoadWAV(path);
    if (!base) {
        fprintf(stderr, "sound: cannot load %s: %s\n", path, Mix_GetError());
        return -1;
    }

    /* Generate evenly-spaced rates in log space between PITCH_MIN..PITCH_MAX */
    float log_min = logf(PITCH_MIN);
    float log_max = logf(PITCH_MAX);

    for (int i = 0; i < NUM_PITCH_VARIANTS; i++) {
        float t = (NUM_PITCH_VARIANTS > 1)
                  ? (float)i / (NUM_PITCH_VARIANTS - 1)
                  : 0.5f;
        float rate = expf(log_min + t * (log_max - log_min));
        out->rates[i] = rate;

        if (fabsf(rate - 1.0f) < 0.01f) {
            /* Keep the original chunk for rate ≈ 1.0 */
            out->variants[i] = base;
        } else {
            out->variants[i] = resample_chunk(base, rate);
        }
    }

    return 0;
}

/**
 * Pick the variant whose rate is closest to @p target and return its index.
 */
static int pick_variant(const pitched_sound_t *ps, float target)
{
    int best = 0;
    float best_dist = fabsf(logf(ps->rates[0]) - logf(target));

    for (int i = 1; i < NUM_PITCH_VARIANTS; i++) {
        float dist = fabsf(logf(ps->rates[i]) - logf(target));
        if (dist < best_dist) {
            best_dist = dist;
            best = i;
        }
    }
    return best;
}

/**
 * Free all variants inside a pitched_sound_t.
 */
static void free_variants(pitched_sound_t *ps)
{
    /* Find the original (rate ≈ 1.0) so we don't double-free. */
    Mix_Chunk *original = NULL;
    for (int i = 0; i < NUM_PITCH_VARIANTS; i++) {
        if (fabsf(ps->rates[i] - 1.0f) < 0.01f) {
            original = ps->variants[i];
            break;
        }
    }

    for (int i = 0; i < NUM_PITCH_VARIANTS; i++) {
        if (ps->variants[i] && ps->variants[i] != original) {
            free(ps->variants[i]->abuf);
            free(ps->variants[i]);
        }
        ps->variants[i] = NULL;
    }

    if (original)
        Mix_FreeChunk(original);
}

/**
 * Apply stereo panning to a channel based on game-X (0–1000).
 * x=0 → full left, x=1000 → full right, x=500 → center.
 */
static void apply_panning(int channel, float x)
{
    float norm = x / 1000.0f;
    if (norm < 0.0f) norm = 0.0f;
    if (norm > 1.0f) norm = 1.0f;

    Uint8 right = (Uint8)(norm * 254);
    Uint8 left  = 254 - right;
    Mix_SetPanning(channel, left, right);
}

/* ---- public API ------------------------------------------------------- */

int sound_init(const char *asset_dir)
{
    if (SDL_Init(SDL_INIT_AUDIO) < 0) {
        fprintf(stderr, "sound: SDL_Init failed: %s\n", SDL_GetError());
        return -1;
    }

    if (Mix_OpenAudio(44100, MIX_DEFAULT_FORMAT, 2, 1024) < 0) {
        fprintf(stderr, "sound: Mix_OpenAudio failed: %s\n", Mix_GetError());
        SDL_Quit();
        return -1;
    }

    Mix_AllocateChannels(NUM_CHANNELS);

    /* Build file paths */
    char bounce_path[512];
    char powerup_path[512];
    const char *dir = asset_dir ? asset_dir : "sounds";
    snprintf(bounce_path,  sizeof(bounce_path),  "%s/Bounce1.wav",  dir);
    snprintf(powerup_path, sizeof(powerup_path), "%s/Pickup3.wav",  dir);

    int ok = 0;
    if (build_variants(bounce_path, &g_bounce) != 0)   ok = -1;
    if (build_variants(powerup_path, &g_powerup) != 0)  ok = -1;

    if (ok < 0) {
        fprintf(stderr, "sound: some WAV files could not be loaded — "
                        "sound partially disabled\n");
    }

    g_enabled = true;
    sound_set_volume(g_volume);
    return 0;
}

void sound_cleanup(void)
{
    if (!g_enabled) return;

    free_variants(&g_bounce);
    free_variants(&g_powerup);

    Mix_CloseAudio();
    SDL_Quit();
    g_enabled = false;
}

void sound_play_bounce(float x, float radius)
{
    if (!g_enabled || !g_bounce.variants[0]) return;

    /*
     * Map radius to pitch rate:
     *   default radius ≈ 12.5, bigger → lower, smaller → higher
     *   rate = clamp(12.5 / radius, 0.5, 2.0)
     */
    float rate = 12.5f / radius;
    if (rate < PITCH_MIN) rate = PITCH_MIN;
    if (rate > PITCH_MAX) rate = PITCH_MAX;

    int idx = pick_variant(&g_bounce, rate);
    apply_panning(BOUNCE_CHANNEL, x);
    Mix_PlayChannel(BOUNCE_CHANNEL, g_bounce.variants[idx], 0);
}

void sound_play_powerup(float x, int type)
{
    if (!g_enabled || !g_powerup.variants[0]) return;

    float rate = 1.0f;
    if (type >= 0 && type < NUM_POWERUP_TYPES)
        rate = POWERUP_RATES[type];

    int idx = pick_variant(&g_powerup, rate);
    apply_panning(POWERUP_CHANNEL, x);
    Mix_PlayChannel(POWERUP_CHANNEL, g_powerup.variants[idx], 0);
}

void sound_set_volume(int volume)
{
    g_volume = volume;
    if (g_volume < 0)   g_volume = 0;
    if (g_volume > 100)  g_volume = 100;

    int mix_vol = (int)((g_volume / 100.0f) * MIX_MAX_VOLUME);
    Mix_Volume(-1, mix_vol);   /* -1 = all channels */
}

bool sound_is_enabled(void)
{
    return g_enabled;
}
