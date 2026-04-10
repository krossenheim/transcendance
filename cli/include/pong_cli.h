#ifndef PONG_CLI_H
#define PONG_CLI_H

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <unistd.h>
#include <signal.h>
#include <time.h>
#include <pthread.h>
#include <ncurses.h>

#define DEFAULT_HOST        "localhost"
#define DEFAULT_PORT        443
#define DEFAULT_WS_PATH     "/ws"

#define KEY_ESCAPE          27

typedef enum {
    STATE_LOGIN,
    STATE_2FA,
    STATE_MENU,
    STATE_MATCHMAKING,
    STATE_LOBBY,
    STATE_IN_GAME,
    STATE_GAME_OVER,
    STATE_SETTINGS,
    STATE_INVITE,
    STATE_INVITATION,
} app_state_t;

#define MAX_ONLINE_USERS 64
typedef struct {
    int  id;
    char username[64];
    bool selected;
} online_user_t;

#endif
