#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <time.h>
#include <ncurses.h>
#include "game.h"
#include "utils.h"
#include "cJSON.h"

static void on_game_state(const char *func_id, int code,
                          const char *payload, void *user_data)
{
    game_state_t *game = (game_state_t *)user_data;
    (void)func_id;

    if (code != 0) return;

    pthread_mutex_lock(&game->mutex);
    game_update_state(game, payload);

    pthread_mutex_unlock(&game->mutex);
}

static void on_lobby_update(const char *func_id, int code,
                            const char *payload, void *user_data)
{
    game_state_t *game = (game_state_t *)user_data;
    (void)func_id;

    if (code != 0) return;

    pthread_mutex_lock(&game->mutex);
    bool was_in_lobby = game->in_lobby;
    game_update_lobby(game, payload);

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
        if (!is_host && !was_in_lobby) {
            game->invitation_pending = true;
        }
        game->in_lobby = true;
    }

    pthread_mutex_unlock(&game->mutex);
}

static void on_game_start(const char *func_id, int code,
                          const char *payload, void *user_data)
{
    game_state_t *game = (game_state_t *)user_data;
    (void)func_id;

    if (code != 0) return;

    pthread_mutex_lock(&game->mutex);
    game_handle_game_start(game, payload);
    pthread_mutex_unlock(&game->mutex);
}

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

    ws_subscribe(ws, "get_game_state", on_game_state, game);
    ws_subscribe(ws, "handle_game_keys", on_game_state, game);
    ws_subscribe(ws, "create_pong_lobby", on_lobby_update, game);
    ws_subscribe(ws, "toggle_player_ready_in_lobby", on_lobby_update, game);
    ws_subscribe(ws, "start_game_from_lobby", on_game_start, game);

    return game;
}

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

int game_create_lobby(game_state_t *game, const char *mode,
                      const int *player_ids, const char **player_usernames,
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
        pthread_mutex_lock(&game->mutex);
        game->in_lobby = true;
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

int game_send_input(game_state_t *game)
{
    if (!game || !game->ws) return -1;

    pthread_mutex_lock(&game->mutex);
    int gid = game->game_id;
    bool ku = game->key_up;
    bool kd = game->key_down;
    pthread_mutex_unlock(&game->mutex);

    if (gid < 0) return -1;

    cJSON *payload = cJSON_CreateObject();
    cJSON_AddNumberToObject(payload, "board_id", gid);

    cJSON *keys = cJSON_CreateArray();
    if (ku) {
        cJSON_AddItemToArray(keys, cJSON_CreateString("ArrowLeft"));
    }
    if (kd) {
        cJSON_AddItemToArray(keys, cJSON_CreateString("ArrowRight"));
    }
    cJSON_AddItemToObject(payload, "pressed_keys", keys);

    cJSON_AddNumberToObject(payload, "clientTimestamp", (double)get_timestamp_ms());

    char *json = cJSON_PrintUnformatted(payload);
    cJSON_Delete(payload);

    if (!json) return -1;

    int result = ws_send_message(game->ws, "pong", "handle_game_keys", json);
    free(json);

    return result;
}

static void parse_ball(const cJSON *ball_arr, ball_t *ball, int index)
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

static void parse_paddle(const cJSON *paddle_arr, paddle_t *paddle, int index)
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

static void parse_wall(const cJSON *wall_arr, wall_t *wall)
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

void game_update_state(game_state_t *game, const char *json_payload)
{
    if (!game || !json_payload) return;

    cJSON *root = cJSON_Parse(json_payload);
    if (!root) return;

    const cJSON *board_id = cJSON_GetObjectItem(root, "board_id");
    if (board_id && cJSON_IsNumber(board_id)) {
        game->game_id = board_id->valueint;
    }

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

    cJSON *paddles = cJSON_GetObjectItem(root, "paddles");
    if (paddles && cJSON_IsArray(paddles)) {
        game->paddle_count = 0;
        cJSON *paddle;
        cJSON_ArrayForEach(paddle, paddles) {
            if (game->paddle_count < MAX_PADDLES) {
                parse_paddle(paddle, &game->paddles[game->paddle_count], game->paddle_count);

                if (game->paddles[game->paddle_count].owner_id == game->my_user_id) {
                    game->my_paddle_id = game->paddle_count;
                }
                game->paddle_count++;
            }
        }
    }

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

    game->active_effect_count = 0;
    cJSON *active_effects = cJSON_GetObjectItem(root, "activeEffects");
    if (active_effects && cJSON_IsArray(active_effects)) {
        cJSON *eff;
        cJSON_ArrayForEach(eff, active_effects) {
            if (game->active_effect_count >= MAX_ACTIVE_EFFECTS) break;
            const cJSON *etype = cJSON_GetObjectItem(eff, "type");
            const cJSON *remaining = cJSON_GetObjectItem(eff, "remainingSeconds");
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

    cJSON *recent_events = cJSON_GetObjectItem(root, "recentEvents");
    if (recent_events && cJSON_IsArray(recent_events)) {
        cJSON *evt;
        cJSON_ArrayForEach(evt, recent_events) {
            if (game->active_effect_count >= MAX_ACTIVE_EFFECTS) break;
            const cJSON *etype = cJSON_GetObjectItem(evt, "type");
            cJSON *age = cJSON_GetObjectItem(evt, "ageSeconds");
            if (etype && cJSON_IsNumber(etype)) {
                float age_sec = (age && cJSON_IsNumber(age)) ? (float)age->valuedouble : 0;
                if (age_sec > 3.0f) continue;
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
                ae->duration_ticks = 0;
                ae->activation_tick = 0;
                ae->expire_time = 0;
                game->active_effect_count++;
            }
        }
    }

    const cJSON *game_over = cJSON_GetObjectItem(root, "gameOver");
    if (game_over && cJSON_IsBool(game_over)) {
        game->game_over = cJSON_IsTrue(game_over);
    }

    const cJSON *winner = cJSON_GetObjectItem(root, "winner");
    if (winner && cJSON_IsNumber(winner)) {
        game->winner_id = winner->valueint;
    }

    const cJSON *metadata = cJSON_GetObjectItem(root, "metadata");
    if (metadata && cJSON_IsObject(metadata)) {
        const cJSON *opts = cJSON_GetObjectItem(metadata, "gameOptions");
        if (opts && cJSON_IsObject(opts)) {
            const cJSON *mode = cJSON_GetObjectItem(opts, "gameMode");
            if (mode && cJSON_IsString(mode) && mode->valuestring) {
                strncpy(game->game_mode, mode->valuestring,
                        sizeof(game->game_mode) - 1);
                game->game_mode[sizeof(game->game_mode) - 1] = '\0';
            }
        }
        cJSON *elim = cJSON_GetObjectItem(metadata, "eliminatedPlayers");
        if (elim && cJSON_IsArray(elim)) {
            game->eliminated_count = 0;
            cJSON *ep;
            cJSON_ArrayForEach(ep, elim) {
                if (game->eliminated_count < MAX_PLAYERS && cJSON_IsNumber(ep))
                    game->eliminated_players[game->eliminated_count++] = ep->valueint;
            }
        }
        cJSON *all_p = cJSON_GetObjectItem(metadata, "allPlayers");
        if (all_p && cJSON_IsArray(all_p)) {
            game->all_player_count = 0;
            cJSON *ap;
            cJSON_ArrayForEach(ap, all_p) {
                if (game->all_player_count < MAX_PLAYERS && cJSON_IsNumber(ap))
                    game->all_player_ids[game->all_player_count++] = ap->valueint;
            }
        }
    }

    game->game_active = !game->game_over;

    cJSON_Delete(root);
}

void game_update_lobby(game_state_t *game, const char *json_payload)
{
    if (!game || !json_payload) return;

    cJSON *root = cJSON_Parse(json_payload);
    if (!root) return;

    const cJSON *lobby_id = cJSON_GetObjectItem(root, "lobbyId");
    if (lobby_id && cJSON_IsNumber(lobby_id)) {
        game->lobby.id = lobby_id->valueint;
    }

    const cJSON *mode = cJSON_GetObjectItem(root, "gameMode");
    if (mode && cJSON_IsString(mode)) {
        strncpy(game->lobby.game_mode, mode->valuestring, sizeof(game->lobby.game_mode) - 1);
    }

    cJSON *players = cJSON_GetObjectItem(root, "players");
    if (players && cJSON_IsArray(players)) {
        game->lobby.player_count = 0;
        cJSON *player;
        cJSON_ArrayForEach(player, players) {
            if (game->lobby.player_count < MAX_PLAYERS) {
                player_t *p = &game->lobby.players[game->lobby.player_count];

                const cJSON *user_id = cJSON_GetObjectItem(player, "userId");
                const cJSON *username = cJSON_GetObjectItem(player, "username");
                const cJSON *is_ready = cJSON_GetObjectItem(player, "isReady");
                const cJSON *is_host = cJSON_GetObjectItem(player, "isHost");

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

    const cJSON *ball_count = cJSON_GetObjectItem(root, "ballCount");
    if (ball_count) game->lobby.ball_count = ball_count->valueint;

    const cJSON *ai_count = cJSON_GetObjectItem(root, "aiCount");
    if (ai_count && cJSON_IsNumber(ai_count)) {
        game->lobby.ai_count = ai_count->valueint;
    } else {
        game->lobby.ai_count = 0;
    }

    const cJSON *max_score = cJSON_GetObjectItem(root, "maxScore");
    if (max_score) game->lobby.max_score = max_score->valueint;

    const cJSON *powerups = cJSON_GetObjectItem(root, "allowPowerups");
    if (powerups) game->lobby.allow_powerups = cJSON_IsTrue(powerups);

    const cJSON *status = cJSON_GetObjectItem(root, "status");
    if (status && cJSON_IsString(status)) {
        strncpy(game->lobby.status, status->valuestring, sizeof(game->lobby.status) - 1);
    }

    game->in_lobby = true;

    cJSON_Delete(root);
}

void game_handle_game_start(game_state_t *game, const char *json_payload)
{
    if (!game || !json_payload) return;

    game_update_state(game, json_payload);

    game->in_lobby = false;
    game->game_active = true;
    game->game_over = false;
}

void game_handle_game_over(game_state_t *game, const char *json_payload)
{
    if (!game || !json_payload) return;

    cJSON *root = cJSON_Parse(json_payload);
    if (!root) return;

    const cJSON *winner = cJSON_GetObjectItem(root, "winner");
    if (winner && cJSON_IsNumber(winner)) {
        game->winner_id = winner->valueint;
    }

    game->game_active = false;
    game->game_over = true;

    cJSON_Delete(root);
}

void game_set_key_up(game_state_t *game, bool pressed)
{
    if (!game) return;
    pthread_mutex_lock(&game->mutex);
    game->key_up = pressed;
    pthread_mutex_unlock(&game->mutex);
}

void game_set_key_down(game_state_t *game, bool pressed)
{
    if (!game) return;
    pthread_mutex_lock(&game->mutex);
    game->key_down = pressed;
    pthread_mutex_unlock(&game->mutex);
}

bool game_is_active(game_state_t *game)
{
    if (!game) return false;
    pthread_mutex_lock(&game->mutex);
    bool active = game->game_active;
    pthread_mutex_unlock(&game->mutex);
    return active;
}
