/**
 * @file game.c
 * @brief Game state and logic for Pong CLI
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <time.h>
#include <ncurses.h>
#include "game.h"
#include "utils.h"
#include "cJSON.h"

/* Message handler for game state updates */
static void on_game_state(const char *func_id, int code, 
                          const char *payload, void *user_data)
{
    game_state_t *game = (game_state_t *)user_data;
    (void)func_id;
    
    /* Ignore error responses */
    if (code != 0) return;
    
    pthread_mutex_lock(&game->mutex);
    game_update_state(game, payload);
    
    pthread_mutex_unlock(&game->mutex);
}

/* Message handler for lobby updates */
static void on_lobby_update(const char *func_id, int code,
                            const char *payload, void *user_data)
{
    game_state_t *game = (game_state_t *)user_data;
    (void)func_id;
    
    /* Ignore error responses (e.g. "Lobby not found") */
    if (code != 0) return;
    
    pthread_mutex_lock(&game->mutex);
    game_update_lobby(game, payload);
    
    /* Check if we're the host or invited */
    bool found_self = false;
    bool is_host = false;
    for (int i = 0; i < game->lobby.player_count; i++) {
        if (game->lobby.players[i].id == game->my_user_id) {
            found_self = true;
            is_host = game->lobby.players[i].is_host;
            break;
        }
    }
    
    if (found_self) {
        game->is_host = is_host;
        if (!is_host && !game->in_lobby) {
            /* We were invited to this lobby */
            game->invitation_pending = true;
        }
        game->in_lobby = true;
    }
    
    pthread_mutex_unlock(&game->mutex);
}

/* Message handler for game start */
static void on_game_start(const char *func_id, int code,
                          const char *payload, void *user_data)
{
    game_state_t *game = (game_state_t *)user_data;
    (void)func_id;
    
    /* Only transition to active game on success (code 0) */
    if (code != 0) return;
    
    pthread_mutex_lock(&game->mutex);
    game_handle_game_start(game, payload);
    pthread_mutex_unlock(&game->mutex);
}

/* Create game state */
game_state_t *game_create(pong_websocket_t *ws, int user_id)
{
    game_state_t *game = calloc(1, sizeof(game_state_t));
    if (!game) return NULL;
    
    game->ws = ws;
    game->my_user_id = user_id;
    game->my_paddle_id = -1;
    game->game_id = -1;
    game->canvas_width = 1000;
    game->canvas_height = 1000;
    
    pthread_mutex_init(&game->mutex, NULL);
    
    /* Subscribe to game messages */
    ws_subscribe(ws, "get_game_state", on_game_state, game);
    ws_subscribe(ws, "handle_game_keys", on_game_state, game);
    ws_subscribe(ws, "create_pong_lobby", on_lobby_update, game);
    ws_subscribe(ws, "toggle_player_ready_in_lobby", on_lobby_update, game);
    ws_subscribe(ws, "start_game_from_lobby", on_game_start, game);
    
    return game;
}

/* Destroy game state */
void game_destroy(game_state_t *game)
{
    if (!game) return;
    
    if (game->ws) {
        ws_unsubscribe(game->ws, "get_game_state");
        ws_unsubscribe(game->ws, "handle_game_keys");
        ws_unsubscribe(game->ws, "create_pong_lobby");
        ws_unsubscribe(game->ws, "toggle_player_ready_in_lobby");
        ws_unsubscribe(game->ws, "start_game_from_lobby");
    }
    
    pthread_mutex_destroy(&game->mutex);
    free(game);
}

/* Create lobby */
int game_create_lobby(game_state_t *game, const char *mode, 
                      int *player_ids, const char **player_usernames,
                      int player_count,
                      int ball_count, int max_score, bool powerups, int ai_count)
{
    if (!game || !game->ws || !mode) return -1;
    
    cJSON *payload = cJSON_CreateObject();
    cJSON_AddStringToObject(payload, "gameMode", mode);
    
    cJSON *ids = cJSON_CreateArray();
    for (int i = 0; i < player_count; i++) {
        cJSON_AddItemToArray(ids, cJSON_CreateNumber(player_ids[i]));
    }
    cJSON_AddItemToObject(payload, "playerIds", ids);
    
    /* Build playerUsernames map: { "<id>": "<name>", ... } */
    if (player_usernames) {
        cJSON *unames = cJSON_CreateObject();
        for (int i = 0; i < player_count; i++) {
            if (player_usernames[i]) {
                char key[32];
                snprintf(key, sizeof(key), "%d", player_ids[i]);
                cJSON_AddStringToObject(unames, key, player_usernames[i]);
            }
        }
        cJSON_AddItemToObject(payload, "playerUsernames", unames);
    }
    
    cJSON_AddNumberToObject(payload, "ballCount", ball_count);
    cJSON_AddNumberToObject(payload, "maxScore", max_score);
    cJSON_AddBoolToObject(payload, "allowPowerups", powerups);
    cJSON_AddNumberToObject(payload, "aiCount", ai_count);
    
    char *json = cJSON_PrintUnformatted(payload);
    cJSON_Delete(payload);
    
    if (!json) return -1;
    
    int result = ws_send_message(game->ws, "pong", "create_pong_lobby", json);
    free(json);
    
    if (result == 0) {
        game->in_lobby = true;
        /* Eagerly populate local lobby settings so auto-ready logic
           doesn't have to wait for the server round-trip.
           Reset lobby.id to 0 so auto-start won't fire with
           a stale ID from a previous lobby. */
        pthread_mutex_lock(&game->mutex);
        game->lobby.id = 0;
        game->lobby.ai_count = ai_count;
        game->lobby.ball_count = ball_count;
        game->lobby.max_score = max_score;
        game->lobby.allow_powerups = powerups;
        strncpy(game->lobby.game_mode, mode, sizeof(game->lobby.game_mode) - 1);
        game->is_host = true;
        game->game_active = false;
        game->game_over = false;
        game->auto_start_sent = false;
        pthread_mutex_unlock(&game->mutex);
    }
    
    return result;
}

/* Join lobby */
int game_join_lobby(game_state_t *game, int lobby_id)
{
    if (!game || !game->ws) return -1;
    
    cJSON *payload = cJSON_CreateObject();
    cJSON_AddNumberToObject(payload, "lobbyId", lobby_id);
    
    char *json = cJSON_PrintUnformatted(payload);
    cJSON_Delete(payload);
    
    if (!json) return -1;
    
    /* There's no explicit join - lobbies are created with player IDs */
    free(json);
    return 0;
}

/* Leave lobby */
int game_leave_lobby(game_state_t *game)
{
    if (!game || !game->ws || !game->in_lobby) return -1;
    
    cJSON *payload = cJSON_CreateObject();
    cJSON_AddNumberToObject(payload, "lobbyId", game->lobby.id);
    
    char *json = cJSON_PrintUnformatted(payload);
    cJSON_Delete(payload);
    
    if (!json) return -1;
    
    int result = ws_send_message(game->ws, "pong", "leave_pong_lobby", json);
    free(json);
    
    if (result == 0) {
        game->in_lobby = false;
    }
    
    return result;
}

/* Toggle ready status */
int game_toggle_ready(game_state_t *game)
{
    if (!game || !game->ws || !game->in_lobby) return -1;
    
    cJSON *payload = cJSON_CreateObject();
    cJSON_AddNumberToObject(payload, "lobbyId", game->lobby.id);
    
    char *json = cJSON_PrintUnformatted(payload);
    cJSON_Delete(payload);
    
    if (!json) return -1;
    
    int result = ws_send_message(game->ws, "pong", "toggle_player_ready_in_lobby", json);
    free(json);
    
    return result;
}

/* Start game from lobby */
int game_start_from_lobby(game_state_t *game)
{
    if (!game || !game->ws || !game->in_lobby) return -1;
    
    cJSON *payload = cJSON_CreateObject();
    cJSON_AddNumberToObject(payload, "lobbyId", game->lobby.id);
    
    char *json = cJSON_PrintUnformatted(payload);
    cJSON_Delete(payload);
    
    if (!json) return -1;
    
    int result = ws_send_message(game->ws, "pong", "start_game_from_lobby", json);
    free(json);
    
    return result;
}

/* Request game state */
int game_request_state(game_state_t *game)
{
    if (!game || !game->ws || game->game_id < 0) return -1;
    
    cJSON *payload = cJSON_CreateObject();
    cJSON_AddNumberToObject(payload, "gameId", game->game_id);
    
    char *json = cJSON_PrintUnformatted(payload);
    cJSON_Delete(payload);
    
    if (!json) return -1;
    
    int result = ws_send_message(game->ws, "pong", "get_game_state", json);
    free(json);
    
    return result;
}

/* Send input to server */
int game_send_input(game_state_t *game)
{
    if (!game || !game->ws || game->game_id < 0) return -1;
    
    cJSON *payload = cJSON_CreateObject();
    cJSON_AddNumberToObject(payload, "board_id", game->game_id);
    
    cJSON *keys = cJSON_CreateArray();
    if (game->key_up) {
        cJSON_AddItemToArray(keys, cJSON_CreateString("ArrowLeft"));
    }
    if (game->key_down) {
        cJSON_AddItemToArray(keys, cJSON_CreateString("ArrowRight"));
    }
    cJSON_AddItemToObject(payload, "pressed_keys", keys);
    
    /* Add client timestamp for lag compensation */
    cJSON_AddNumberToObject(payload, "clientTimestamp", (double)get_timestamp_ms());
    
    char *json = cJSON_PrintUnformatted(payload);
    cJSON_Delete(payload);
    
    if (!json) return -1;
    
    int result = ws_send_message(game->ws, "pong", "handle_game_keys", json);
    free(json);
    
    return result;
}

/* Report ready for game */
int game_report_ready(game_state_t *game)
{
    if (!game || !game->ws || game->game_id < 0) return -1;
    
    cJSON *payload = cJSON_CreateObject();
    cJSON_AddNumberToObject(payload, "game_id", game->game_id);
    
    char *json = cJSON_PrintUnformatted(payload);
    cJSON_Delete(payload);
    
    if (!json) return -1;
    
    int result = ws_send_message(game->ws, "pong", "report_ready_for_pong_game", json);
    free(json);
    
    return result;
}

/* Parse ball from JSON tuple [x, y, vx, vy, radius, inverse_mass, id?] */
static void parse_ball(cJSON *ball_arr, ball_t *ball, int index)
{
    if (!ball_arr || !cJSON_IsArray(ball_arr)) return;
    
    int size = cJSON_GetArraySize(ball_arr);
    if (size >= 6) {
        ball->x = (float)cJSON_GetArrayItem(ball_arr, 0)->valuedouble;
        ball->y = (float)cJSON_GetArrayItem(ball_arr, 1)->valuedouble;
        ball->vx = (float)cJSON_GetArrayItem(ball_arr, 2)->valuedouble;
        ball->vy = (float)cJSON_GetArrayItem(ball_arr, 3)->valuedouble;
        ball->radius = (float)cJSON_GetArrayItem(ball_arr, 4)->valuedouble;
        ball->inverse_mass = (float)cJSON_GetArrayItem(ball_arr, 5)->valuedouble;
        ball->id = (size >= 7) ? cJSON_GetArrayItem(ball_arr, 6)->valueint : index;
        ball->active = true;
    }
}

/* Parse paddle from JSON tuple [x, y, angle, width, height, vx, vy, playerId] */
static void parse_paddle(cJSON *paddle_arr, paddle_t *paddle, int index)
{
    if (!paddle_arr || !cJSON_IsArray(paddle_arr)) return;
    
    int size = cJSON_GetArraySize(paddle_arr);
    if (size >= 8) {
        paddle->x = (float)cJSON_GetArrayItem(paddle_arr, 0)->valuedouble;
        paddle->y = (float)cJSON_GetArrayItem(paddle_arr, 1)->valuedouble;
        paddle->angle = (float)cJSON_GetArrayItem(paddle_arr, 2)->valuedouble;
        paddle->width = (float)cJSON_GetArrayItem(paddle_arr, 3)->valuedouble;
        paddle->height = (float)cJSON_GetArrayItem(paddle_arr, 4)->valuedouble;
        paddle->vx = (float)cJSON_GetArrayItem(paddle_arr, 5)->valuedouble;
        paddle->vy = (float)cJSON_GetArrayItem(paddle_arr, 6)->valuedouble;
        paddle->owner_id = cJSON_GetArrayItem(paddle_arr, 7)->valueint;
        paddle->id = index;
    }
}

/* Parse wall from JSON tuple [x1, y1, x2, y2, vx, vy, playerId] */
static void parse_wall(cJSON *wall_arr, wall_t *wall)
{
    if (!wall_arr || !cJSON_IsArray(wall_arr)) return;
    
    int size = cJSON_GetArraySize(wall_arr);
    if (size >= 7) {
        wall->x1 = (float)cJSON_GetArrayItem(wall_arr, 0)->valuedouble;
        wall->y1 = (float)cJSON_GetArrayItem(wall_arr, 1)->valuedouble;
        wall->x2 = (float)cJSON_GetArrayItem(wall_arr, 2)->valuedouble;
        wall->y2 = (float)cJSON_GetArrayItem(wall_arr, 3)->valuedouble;
        wall->vx = (float)cJSON_GetArrayItem(wall_arr, 4)->valuedouble;
        wall->vy = (float)cJSON_GetArrayItem(wall_arr, 5)->valuedouble;
        
        cJSON *player_id = cJSON_GetArrayItem(wall_arr, 6);
        wall->player_id = cJSON_IsNull(player_id) ? -1 : player_id->valueint;
    }
}

/* Update game state from JSON */
void game_update_state(game_state_t *game, const char *json_payload)
{
    if (!game || !json_payload) return;
    
    cJSON *root = cJSON_Parse(json_payload);
    if (!root) return;
    
    /* Parse board_id */
    cJSON *board_id = cJSON_GetObjectItem(root, "board_id");
    if (board_id && cJSON_IsNumber(board_id)) {
        game->game_id = board_id->valueint;
    }
    
    /* Parse balls */
    cJSON *balls = cJSON_GetObjectItem(root, "balls");
    if (balls && cJSON_IsArray(balls)) {
        game->ball_count = 0;
        cJSON *ball;
        cJSON_ArrayForEach(ball, balls) {
            if (game->ball_count < MAX_BALLS) {
                parse_ball(ball, &game->balls[game->ball_count], game->ball_count);
                game->ball_count++;
            }
        }
    }
    
    /* Parse paddles */
    cJSON *paddles = cJSON_GetObjectItem(root, "paddles");
    if (paddles && cJSON_IsArray(paddles)) {
        game->paddle_count = 0;
        cJSON *paddle;
        cJSON_ArrayForEach(paddle, paddles) {
            if (game->paddle_count < MAX_PADDLES) {
                parse_paddle(paddle, &game->paddles[game->paddle_count], game->paddle_count);
                
                /* Track my paddle */
                if (game->paddles[game->paddle_count].owner_id == game->my_user_id) {
                    game->my_paddle_id = game->paddle_count;
                }
                game->paddle_count++;
            }
        }
    }
    
    /* Parse walls */
    cJSON *walls = cJSON_GetObjectItem(root, "walls");
    if (walls && cJSON_IsArray(walls)) {
        game->wall_count = 0;
        cJSON *wall;
        cJSON_ArrayForEach(wall, walls) {
            if (game->wall_count < MAX_WALLS) {
                parse_wall(wall, &game->walls[game->wall_count]);
                game->wall_count++;
            }
        }
    }
    
    /* Parse score */
    cJSON *score = cJSON_GetObjectItem(root, "score");
    if (score && cJSON_IsObject(score)) {
        game->player_count = 0;
        cJSON *player_score;
        cJSON_ArrayForEach(player_score, score) {
            if (game->player_count < MAX_PLAYERS) {
                int player_id = atoi(player_score->string);
                game->players[game->player_count].id = player_id;
                game->players[game->player_count].score = player_score->valueint;
                game->player_count++;
            }
        }
    }
    
    /* Parse powerups [x, y, vx, vy, radius, spawnTick, type, durationTicks, activationTick] */
    /* NOTE: Server only sends uncollected powerups in this array */
    cJSON *powerups = cJSON_GetObjectItem(root, "powerups");
    if (powerups && cJSON_IsArray(powerups)) {
        game->powerup_count = 0;
        cJSON *pu;
        cJSON_ArrayForEach(pu, powerups) {
            if (game->powerup_count < MAX_POWERUPS && cJSON_IsArray(pu)) {
                int sz = cJSON_GetArraySize(pu);
                if (sz >= 7) {
                    powerup_t *p = &game->powerups[game->powerup_count];
                    p->x = (float)cJSON_GetArrayItem(pu, 0)->valuedouble;
                    p->y = (float)cJSON_GetArrayItem(pu, 1)->valuedouble;
                    p->type = cJSON_GetArrayItem(pu, 6)->valueint;
                    p->active = true;
                    p->id = game->powerup_count;
                    p->duration_ticks = -1;
                    p->activation_tick = -1;
                    game->powerup_count++;
                }
            }
        }
    }

    /* Parse activeEffects: collected time-based powerups currently in effect
     * Each element: { type, typeName, remainingTicks, remainingSeconds } */
    game->active_effect_count = 0;
    cJSON *active_effects = cJSON_GetObjectItem(root, "activeEffects");
    if (active_effects && cJSON_IsArray(active_effects)) {
        cJSON *eff;
        cJSON_ArrayForEach(eff, active_effects) {
            if (game->active_effect_count >= MAX_ACTIVE_EFFECTS) break;
            cJSON *etype = cJSON_GetObjectItem(eff, "type");
            cJSON *remaining = cJSON_GetObjectItem(eff, "remainingSeconds");
            if (etype && cJSON_IsNumber(etype)) {
                active_effect_t *ae = &game->active_effects[game->active_effect_count];
                ae->type = etype->valueint;
                ae->duration_ticks = remaining ? (int)(remaining->valuedouble * 120) : 0;
                ae->activation_tick = 0;
                ae->expire_time = 0;
                game->active_effect_count++;
            }
        }
    }

    /* Parse recentEvents: recently collected instant powerups (notifications)
     * Each element: { type, typeName, ageSeconds } */
    cJSON *recent_events = cJSON_GetObjectItem(root, "recentEvents");
    if (recent_events && cJSON_IsArray(recent_events)) {
        cJSON *evt;
        cJSON_ArrayForEach(evt, recent_events) {
            if (game->active_effect_count >= MAX_ACTIVE_EFFECTS) break;
            cJSON *etype = cJSON_GetObjectItem(evt, "type");
            cJSON *age = cJSON_GetObjectItem(evt, "ageSeconds");
            if (etype && cJSON_IsNumber(etype)) {
                float age_sec = (age && cJSON_IsNumber(age)) ? (float)age->valuedouble : 0;
                /* Only show recent events (within 3 seconds) */
                if (age_sec > 3.0f) continue;
                /* Don't add if this type is already in active_effects (time-based) */
                bool dup = false;
                for (int j = 0; j < game->active_effect_count; j++) {
                    if (game->active_effects[j].type == etype->valueint) {
                        dup = true;
                        break;
                    }
                }
                if (dup) continue;
                active_effect_t *ae = &game->active_effects[game->active_effect_count];
                ae->type = etype->valueint;
                ae->duration_ticks = 0;  /* instant */
                ae->activation_tick = 0;
                ae->expire_time = 0;
                game->active_effect_count++;
            }
        }
    }

    /* Parse game over state */
    cJSON *game_over = cJSON_GetObjectItem(root, "gameOver");
    if (game_over && cJSON_IsBool(game_over)) {
        game->game_over = cJSON_IsTrue(game_over);
    }
    
    cJSON *winner = cJSON_GetObjectItem(root, "winner");
    if (winner && cJSON_IsNumber(winner)) {
        game->winner_id = winner->valueint;
    }
    
    /* Mark game as active */
    game->game_active = !game->game_over;

    /* ---- Sound event detection ---------------------------------------- */

    /* Bounce detection: check if any ball's velocity direction reversed */
    for (int i = 0; i < game->ball_count && i < game->prev_ball_count; i++) {
        float pvx = game->prev_vx[i];
        float pvy = game->prev_vy[i];
        float cvx = game->balls[i].vx;
        float cvy = game->balls[i].vy;

        /* A sign flip in either axis means a bounce occurred */
        bool flipped_x = (pvx != 0.0f && cvx != 0.0f && ((pvx > 0) != (cvx > 0)));
        bool flipped_y = (pvy != 0.0f && cvy != 0.0f && ((pvy > 0) != (cvy > 0)));

        if (flipped_x || flipped_y) {
            game->bounce_pending  = true;
            game->bounce_x        = game->balls[i].x;
            game->bounce_radius   = game->balls[i].radius;
            break;  /* one bounce sound per update is enough */
        }
    }

    /* Powerup pickup detection: any prev powerup id that is no longer present */
    for (int i = 0; i < game->prev_powerup_count; i++) {
        int prev_id = game->prev_powerup_ids[i];
        bool still_exists = false;
        for (int j = 0; j < game->powerup_count; j++) {
            if (game->powerups[j].id == prev_id) {
                still_exists = true;
                break;
            }
        }
        if (!still_exists) {
            game->powerup_pickup_pending = true;
            game->powerup_pickup_x       = game->prev_powerup_x[i];
            game->powerup_pickup_type    = game->prev_powerup_types[i];
            break;  /* one pickup sound per update */
        }
    }

    /* Save current state for next-frame comparison */
    game->prev_ball_count = game->ball_count;
    for (int i = 0; i < game->ball_count && i < MAX_BALLS; i++) {
        game->prev_vx[i] = game->balls[i].vx;
        game->prev_vy[i] = game->balls[i].vy;
    }
    game->prev_powerup_count = game->powerup_count;
    for (int i = 0; i < game->powerup_count && i < MAX_POWERUPS; i++) {
        game->prev_powerup_ids[i]   = game->powerups[i].id;
        game->prev_powerup_x[i]     = game->powerups[i].x;
        game->prev_powerup_types[i] = game->powerups[i].type;
    }

    cJSON_Delete(root);
}

/* Update lobby state from JSON */
void game_update_lobby(game_state_t *game, const char *json_payload)
{
    if (!game || !json_payload) return;
    
    cJSON *root = cJSON_Parse(json_payload);
    if (!root) return;
    
    /* Parse lobby ID */
    cJSON *lobby_id = cJSON_GetObjectItem(root, "lobbyId");
    if (lobby_id && cJSON_IsNumber(lobby_id)) {
        game->lobby.id = lobby_id->valueint;
    }
    
    /* Parse game mode */
    cJSON *mode = cJSON_GetObjectItem(root, "gameMode");
    if (mode && cJSON_IsString(mode)) {
        strncpy(game->lobby.game_mode, mode->valuestring, sizeof(game->lobby.game_mode) - 1);
    }
    
    /* Parse players */
    cJSON *players = cJSON_GetObjectItem(root, "players");
    if (players && cJSON_IsArray(players)) {
        game->lobby.player_count = 0;
        cJSON *player;
        cJSON_ArrayForEach(player, players) {
            if (game->lobby.player_count < MAX_PLAYERS) {
                player_t *p = &game->lobby.players[game->lobby.player_count];
                
                cJSON *user_id = cJSON_GetObjectItem(player, "userId");
                cJSON *username = cJSON_GetObjectItem(player, "username");
                cJSON *is_ready = cJSON_GetObjectItem(player, "isReady");
                cJSON *is_host = cJSON_GetObjectItem(player, "isHost");
                
                if (user_id) p->id = user_id->valueint;
                if (username && cJSON_IsString(username)) {
                    strncpy(p->username, username->valuestring, sizeof(p->username) - 1);
                }
                if (is_ready) p->ready = cJSON_IsTrue(is_ready);
                if (is_host) p->is_host = cJSON_IsTrue(is_host);
                
                game->lobby.player_count++;
            }
        }
    }
    
    /* Parse other settings */
    cJSON *ball_count = cJSON_GetObjectItem(root, "ballCount");
    if (ball_count) game->lobby.ball_count = ball_count->valueint;

    cJSON *ai_count = cJSON_GetObjectItem(root, "aiCount");
    if (ai_count && cJSON_IsNumber(ai_count)) {
        game->lobby.ai_count = ai_count->valueint;
    } else {
        game->lobby.ai_count = 0;
    }
    
    cJSON *max_score = cJSON_GetObjectItem(root, "maxScore");
    if (max_score) game->lobby.max_score = max_score->valueint;
    
    cJSON *powerups = cJSON_GetObjectItem(root, "allowPowerups");
    if (powerups) game->lobby.allow_powerups = cJSON_IsTrue(powerups);
    
    cJSON *status = cJSON_GetObjectItem(root, "status");
    if (status && cJSON_IsString(status)) {
        strncpy(game->lobby.status, status->valuestring, sizeof(game->lobby.status) - 1);
    }
    
    game->in_lobby = true;
    
    cJSON_Delete(root);
}

/* Handle game start */
void game_handle_game_start(game_state_t *game, const char *json_payload)
{
    if (!game || !json_payload) return;
    
    /* Parse the game state from the payload */
    game_update_state(game, json_payload);
    
    game->in_lobby = false;
    game->game_active = true;
    game->game_over = false;
}

/* Handle game over */
void game_handle_game_over(game_state_t *game, const char *json_payload)
{
    if (!game || !json_payload) return;
    
    cJSON *root = cJSON_Parse(json_payload);
    if (!root) return;
    
    cJSON *winner = cJSON_GetObjectItem(root, "winner");
    if (winner && cJSON_IsNumber(winner)) {
        game->winner_id = winner->valueint;
    }
    
    game->game_active = false;
    game->game_over = true;
    
    cJSON_Delete(root);
}

/* Set key up state */
void game_set_key_up(game_state_t *game, bool pressed)
{
    if (!game) return;
    pthread_mutex_lock(&game->mutex);
    game->key_up = pressed;
    pthread_mutex_unlock(&game->mutex);
}

/* Set key down state */
void game_set_key_down(game_state_t *game, bool pressed)
{
    if (!game) return;
    pthread_mutex_lock(&game->mutex);
    game->key_down = pressed;
    pthread_mutex_unlock(&game->mutex);
}

/* Process input character */
void game_process_input(game_state_t *game, int ch)
{
    if (!game) return;
    
    switch (ch) {
        case 'w':
        case 'W':
        case KEY_UP:
            game_set_key_up(game, true);
            game_set_key_down(game, false);
            break;
            
        case 's':
        case 'S':
        case KEY_DOWN:
            game_set_key_up(game, false);
            game_set_key_down(game, true);
            break;
            
        default:
            /* Release keys on any other input */
            game_set_key_up(game, false);
            game_set_key_down(game, false);
            break;
    }
}

/* Check if game is active */
bool game_is_active(game_state_t *game)
{
    if (!game) return false;
    pthread_mutex_lock(&game->mutex);
    bool active = game->game_active;
    pthread_mutex_unlock(&game->mutex);
    return active;
}

/* Check if in lobby */
bool game_is_in_lobby(game_state_t *game)
{
    if (!game) return false;
    pthread_mutex_lock(&game->mutex);
    bool in_lobby = game->in_lobby;
    pthread_mutex_unlock(&game->mutex);
    return in_lobby;
}

/* Get my score */
int game_get_my_score(game_state_t *game)
{
    if (!game) return 0;
    
    pthread_mutex_lock(&game->mutex);
    int score = 0;
    for (int i = 0; i < game->player_count; i++) {
        if (game->players[i].id == game->my_user_id) {
            score = game->players[i].score;
            break;
        }
    }
    pthread_mutex_unlock(&game->mutex);
    
    return score;
}

/* Get opponent score */
int game_get_opponent_score(game_state_t *game)
{
    if (!game) return 0;
    
    pthread_mutex_lock(&game->mutex);
    int score = 0;
    for (int i = 0; i < game->player_count; i++) {
        if (game->players[i].id != game->my_user_id) {
            score = game->players[i].score;
            break;
        }
    }
    pthread_mutex_unlock(&game->mutex);
    
    return score;
}

/* Get winner name */
const char *game_get_winner_name(game_state_t *game)
{
    if (!game) return "Unknown";
    
    pthread_mutex_lock(&game->mutex);
    const char *name = "Unknown";
    for (int i = 0; i < game->player_count; i++) {
        if (game->players[i].id == game->winner_id) {
            name = game->players[i].username;
            break;
        }
    }
    pthread_mutex_unlock(&game->mutex);
    
    return name;
}

/* Get my paddle */
paddle_t *game_get_my_paddle(game_state_t *game)
{
    if (!game || game->my_paddle_id < 0 || game->my_paddle_id >= game->paddle_count) {
        return NULL;
    }
    return &game->paddles[game->my_paddle_id];
}

/* Get paddle by owner */
paddle_t *game_get_paddle_by_owner(game_state_t *game, int owner_id)
{
    if (!game) return NULL;
    
    for (int i = 0; i < game->paddle_count; i++) {
        if (game->paddles[i].owner_id == owner_id) {
            return &game->paddles[i];
        }
    }
    return NULL;
}
