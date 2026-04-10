#ifndef GAME_H
#define GAME_H

#include <stdbool.h>
#include <pthread.h>
#include "websocket.h"

#define MAX_BALLS       10
#define MAX_PADDLES     16
#define MAX_WALLS       16
#define MAX_POWERUPS    5
#define MAX_PLAYERS     16
#define MAX_ACTIVE_EFFECTS 10

#define PWRUP_ADD_BALL              0
#define PWRUP_INCREASE_PADDLE_SPEED 1
#define PWRUP_DECREASE_PADDLE_SPEED 2
#define PWRUP_SUPER_SPEED           3
#define PWRUP_INCREASE_BALL_SIZE    4
#define PWRUP_DECREASE_BALL_SIZE    5
#define PWRUP_REVERSE_CONTROLS      6

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

typedef struct {
    float   x1, y1;
    float   x2, y2;
    float   vx, vy;
    int     player_id;
} wall_t;

typedef struct {
    int     id;
    int     type;
    float   x;
    float   y;
    bool    active;
    int     duration_ticks;
    int     activation_tick;
} powerup_t;

typedef struct {
    int     type;
    int     activation_tick;
    int     duration_ticks;
    float   expire_time;
} active_effect_t;

typedef struct {
    int     id;
    char    username[64];
    int     score;
    bool    ready;
    bool    connected;
    bool    is_host;
    int     paddle_id;
} player_t;

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

typedef struct game_state {
    int             game_id;
    int             my_user_id;
    int             my_paddle_id;
    
    ball_t          balls[MAX_BALLS];
    int             ball_count;
    paddle_t        paddles[MAX_PADDLES];
    int             paddle_count;
    wall_t          walls[MAX_WALLS];
    int             wall_count;
    powerup_t       powerups[MAX_POWERUPS];
    int             powerup_count;
    
    active_effect_t active_effects[MAX_ACTIVE_EFFECTS];
    int             active_effect_count;
    
    player_t        players[MAX_PLAYERS];
    int             player_count;
    
    bool            game_active;
    bool            game_over;
    int             winner_id;
    int             canvas_width;
    int             canvas_height;
    float           game_time;
    float           max_game_time;

    char            game_mode[32];
    int             eliminated_players[MAX_PLAYERS];
    int             eliminated_count;

    int             all_player_ids[MAX_PLAYERS];
    int             all_player_count;
    
    bool            key_up;
    bool            key_down;
    
    lobby_t         lobby;
    bool            in_lobby;
    bool            invitation_pending;
    bool            is_host;
    bool            auto_start_sent;

    pthread_mutex_t mutex;
    
    pong_websocket_t *ws;
} game_state_t;

game_state_t    *game_create(pong_websocket_t *ws, int user_id);
void            game_destroy(game_state_t *game);

int             game_create_lobby(game_state_t *game, const char *mode, 
                                   int *player_ids, const char **player_usernames,
                                   int player_count,
                                   int ball_count, int max_score, bool powerups,
                                   int ai_count);
int             game_leave_lobby(game_state_t *game);
int             game_toggle_ready(game_state_t *game);
int             game_start_from_lobby(game_state_t *game);

int             game_send_input(game_state_t *game);

void            game_update_state(game_state_t *game, const char *json_payload);
void            game_update_lobby(game_state_t *game, const char *json_payload);
void            game_handle_game_start(game_state_t *game, const char *json_payload);
void            game_handle_game_over(game_state_t *game, const char *json_payload);

void            game_set_key_up(game_state_t *game, bool pressed);
void            game_set_key_down(game_state_t *game, bool pressed);

bool            game_is_active(game_state_t *game);

#endif /* GAME_H */
