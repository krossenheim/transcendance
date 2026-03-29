/**
 * @file pong_cli.h
 * @brief Main header file for Pong CLI application
 * 
 * This CLI client allows users to play Pong against web users.
 * It connects to the game server via WebSocket and provides a
 * terminal-based interface for gameplay.
 */

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

/* Application constants */
#define APP_NAME            "pong-cli"
#define APP_VERSION         "1.0.0"
#define CONFIG_DIR          ".pong-cli"
#define SESSION_FILE        "session.json"

/* Default server settings */
#define DEFAULT_HOST        "localhost"
#define DEFAULT_PORT        443
#define DEFAULT_WS_PATH     "/ws"

/* Game constants */
#define CANVAS_WIDTH        1000
#define CANVAS_HEIGHT       1000

/* Key bindings */
#define KEY_UP_PRIMARY      'w'
#define KEY_DOWN_PRIMARY    's'
#define KEY_UP_SECONDARY    'k'
#define KEY_DOWN_SECONDARY  'j'
#define KEY_QUIT            'q'
#define KEY_PAUSE           'p'
#define KEY_ESCAPE          27

/* Error codes */
typedef enum {
    PONG_OK = 0,
    PONG_ERR_MEMORY,
    PONG_ERR_NETWORK,
    PONG_ERR_AUTH,
    PONG_ERR_PARSE,
    PONG_ERR_TIMEOUT,
    PONG_ERR_INVALID_ARG,
    PONG_ERR_NOT_CONNECTED,
    PONG_ERR_GAME_NOT_FOUND,
} pong_error_t;

/* Application state */
typedef enum {
    STATE_INIT,
    STATE_LOGIN,
    STATE_2FA,
    STATE_MENU,
    STATE_MATCHMAKING,
    STATE_LOBBY,
    STATE_WAITING,
    STATE_IN_GAME,
    STATE_PLAYING,
    STATE_GAME_OVER,
    STATE_SETTINGS,
    STATE_INVITE,
    STATE_INVITATION,  /* Received an invite from another player */
    STATE_QUIT,
} app_state_t;

/* Online user info (for invite screen) */
#define MAX_ONLINE_USERS 64
typedef struct {
    int  id;
    char username[64];
    bool selected;
} online_user_t;

/* Forward declarations */
struct auth_session;
struct pong_websocket;
struct game_state;

#endif /* PONG_CLI_H */
