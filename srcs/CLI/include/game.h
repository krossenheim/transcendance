/**
 * @file game.h
 * @brief Game state and logic for Pong CLI
 * 
 * Manages game state synchronization with the server,
 * input handling, and game logic.
 */

#ifndef GAME_H
#define GAME_H

#include <stdbool.h>
#include <pthread.h>
#include "websocket.h"

/* Game state constants */
#define MAX_BALLS       10
#define MAX_PADDLES     8
#define MAX_WALLS       16
#define MAX_POWERUPS    5
#define MAX_PLAYERS     8
#define MAX_ACTIVE_EFFECTS 10

/* Powerup types (must match server enum order) */
#define PWRUP_ADD_BALL              0
#define PWRUP_INCREASE_PADDLE_SPEED 1
#define PWRUP_DECREASE_PADDLE_SPEED 2
#define PWRUP_SUPER_SPEED           3
#define PWRUP_INCREASE_BALL_SIZE    4
#define PWRUP_DECREASE_BALL_SIZE    5
#define PWRUP_REVERSE_CONTROLS      6

/* Ball state (matches server tuple format) */
typedef struct {
    int     id;
    float   x;
    float   y;
    float   vx;
    float   vy;
    float   radius;
    float   inverse_mass;
    bool    active;
} ball_t;

/* Paddle state (matches server tuple format) */
typedef struct {
    int     id;
    int     owner_id;
    float   x;
    float   y;
    float   angle;
    float   width;
    float   height;
    float   vx;
    float   vy;
} paddle_t;

/* Wall state (matches server tuple format) */
typedef struct {
    float   x1, y1;
    float   x2, y2;
    float   vx, vy;
    int     player_id;  /* -1 if not a goal */
} wall_t;

/* Power-up state */
typedef struct {
    int     id;
    int     type;
    float   x;
    float   y;
    bool    active;
    int     duration_ticks;   /* -1 = instant/permanent */
    int     activation_tick;  /* -1 = not yet collected */
} powerup_t;

/* Active powerup effect (collected, with duration) */
typedef struct {
    int     type;
    int     activation_tick;
    int     duration_ticks;   /* remaining display time in ticks */
    float   expire_time;      /* wall-clock time when the notification expires */
} active_effect_t;

/* Player state */
typedef struct {
    int     id;
    char    username[64];
    int     score;
    bool    ready;
    bool    connected;
    bool    is_host;
    int     paddle_id;
} player_t;

/* Lobby state */
typedef struct {
    int         id;
    char        game_mode[32];
    player_t    players[MAX_PLAYERS];
    int         player_count;
    int         ai_count;
    int         ball_count;
    int         max_score;
    bool        allow_powerups;
    char        status[32];
} lobby_t;

/* Full game state */
typedef struct game_state {
    /* Game identification */
    int             game_id;
    int             my_user_id;
    int             my_paddle_id;
    
    /* Game objects */
    ball_t          balls[MAX_BALLS];
    int             ball_count;
    paddle_t        paddles[MAX_PADDLES];
    int             paddle_count;
    wall_t          walls[MAX_WALLS];
    int             wall_count;
    powerup_t       powerups[MAX_POWERUPS];
    int             powerup_count;
    
    /* Active powerup effects (collected, shown in status bar) */
    active_effect_t active_effects[MAX_ACTIVE_EFFECTS];
    int             active_effect_count;
    
    /* Players and scores */
    player_t        players[MAX_PLAYERS];
    int             player_count;
    
    /* Game status */
    bool            game_active;
    bool            game_over;
    int             winner_id;
    int             canvas_width;
    int             canvas_height;
    float           game_time;
    float           max_game_time;
    
    /* Input state */
    bool            key_up;
    bool            key_down;
    
    /* Lobby state (for waiting screen) */
    lobby_t         lobby;
    bool            in_lobby;
    bool            invitation_pending;  /* True when invited by another player */
    bool            is_host;             /* True if we created the lobby */
    bool            auto_start_sent;     /* True after auto-start_from_lobby sent */
    
    /* Sound event tracking (set by game_update_state, consumed by game loop) */
    bool            bounce_pending;       /* A ball bounced since last frame  */
    float           bounce_x;             /* X position of the bounced ball   */
    float           bounce_radius;        /* Radius of the bounced ball       */
    bool            powerup_pickup_pending; /* A powerup was collected        */
    float           powerup_pickup_x;     /* X position of collected powerup  */
    int             powerup_pickup_type;  /* Type of collected powerup        */

    /* Previous-frame state for bounce / pickup detection */
    int             prev_ball_ids[MAX_BALLS];  /* previous ball ids              */
    float           prev_vx[MAX_BALLS];   /* previous ball vx values          */
    float           prev_vy[MAX_BALLS];   /* previous ball vy values          */
    int             prev_ball_count;      /* previous ball count              */
    int             prev_powerup_ids[MAX_POWERUPS]; /* prev powerup ids       */
    float           prev_powerup_x[MAX_POWERUPS];   /* prev powerup x pos     */
    int             prev_powerup_types[MAX_POWERUPS];/* prev powerup types     */
    int             prev_powerup_count;   /* previous powerup count           */

    /* Threading */
    pthread_mutex_t mutex;
    
    /* WebSocket reference */
    pong_websocket_t *ws;
} game_state_t;

/* Game lifecycle */
game_state_t    *game_create(pong_websocket_t *ws, int user_id);
void            game_destroy(game_state_t *game);

/* Lobby operations */
int             game_create_lobby(game_state_t *game, const char *mode, 
                                   int *player_ids, const char **player_usernames,
                                   int player_count,
                                   int ball_count, int max_score, bool powerups,
                                   int ai_count);
int             game_join_lobby(game_state_t *game, int lobby_id);
int             game_leave_lobby(game_state_t *game);
int             game_toggle_ready(game_state_t *game);
int             game_start_from_lobby(game_state_t *game);

/* Game operations */
int             game_request_state(game_state_t *game);
int             game_send_input(game_state_t *game);
int             game_report_ready(game_state_t *game);

/* State updates (called from websocket callbacks) */
void            game_update_state(game_state_t *game, const char *json_payload);
void            game_update_lobby(game_state_t *game, const char *json_payload);
void            game_handle_game_start(game_state_t *game, const char *json_payload);
void            game_handle_game_over(game_state_t *game, const char *json_payload);

/* Input handling */
void            game_set_key_up(game_state_t *game, bool pressed);
void            game_set_key_down(game_state_t *game, bool pressed);
void            game_process_input(game_state_t *game, int ch);

/* State queries */
bool            game_is_active(game_state_t *game);
bool            game_is_in_lobby(game_state_t *game);
int             game_get_my_score(game_state_t *game);
int             game_get_opponent_score(game_state_t *game);
const char      *game_get_winner_name(game_state_t *game);

/* Paddle helper */
paddle_t        *game_get_my_paddle(game_state_t *game);
paddle_t        *game_get_paddle_by_owner(game_state_t *game, int owner_id);

#endif /* GAME_H */
