/**
 * @file main.c
 * @brief Main entry point for Pong CLI
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <signal.h>
#include <unistd.h>
#include <time.h>
#include <execinfo.h>
#include <stdarg.h>

#include "pong_cli.h"
#include "auth.h"
#include "websocket.h"
#include "game.h"
#include "renderer.h"
#include "utils.h"
#include "cJSON.h"
#include <libwebsockets.h>

/* Debug logging to file */
static FILE *g_debug_log = NULL;

static void debug_log(const char *fmt, ...)
{
    if (!g_debug_log) {
        g_debug_log = fopen("/tmp/pong_cli_debug.log", "w");
        if (!g_debug_log) return;
    }
    va_list args;
    va_start(args, fmt);
    vfprintf(g_debug_log, fmt, args);
    va_end(args);
    fflush(g_debug_log);
}

static void crash_handler(int sig)
{
    renderer_cleanup();
    
    FILE *f = fopen("/tmp/pong_cli_crash.log", "w");
    if (f) {
        void *array[20];
        size_t size;
        fprintf(f, "Crashed with signal %d\n", sig);
        size = backtrace(array, 20);
        backtrace_symbols_fd(array, size, fileno(f));
        fclose(f);
    }
    
    signal(sig, SIG_DFL);
    raise(sig);
}

/* Default server configuration */
#define DEFAULT_HOST "localhost"
#define DEFAULT_PORT 443

/* Input field limits */
#define MAX_INPUT_LEN 128

/* Application context */
typedef struct {
    app_state_t state;
    auth_session_t *session;
    pong_websocket_t *ws;
    game_state_t *game;
    
    /* Server config */
    char host[256];
    int port;
    bool use_ssl;
    
    /* Login form */
    char username[MAX_INPUT_LEN];
    char password[MAX_INPUT_LEN];
    char totp_code[16];
    int login_field;  /* 0 = username, 1 = password */
    char login_error[256];
    
    /* Menu state */
    int menu_selection;
    
    /* Game settings */
    int ball_count;
    int max_score;
    bool allow_powerups;
    int ai_count;
    
    /* Matchmaking */
    char game_mode[32];
    time_t match_start_time;
    
    /* Invite / online users */
    online_user_t online_users[MAX_ONLINE_USERS];
    int online_user_count;
    int invite_selection;
    bool invite_fetching;       /* true while waiting for server response */
    char invite_search[64];     /* username search field */
    bool invite_search_mode;    /* true when typing in search field */
    
    /* Running flag */
    volatile bool running;
    
    /* Sound enabled flag (disabled by default due to SDL/terminal issues) */
    bool enable_sound;
} app_context_t;

/* Global context for signal handler */
static app_context_t *g_ctx = NULL;

/* Forward declarations */
static int app_connect_ws(app_context_t *ctx);
static void app_subscribe_invite_handlers(app_context_t *ctx);

/* Signal handler for clean shutdown */
static void signal_handler(int sig)
{
    (void)sig;
    if (g_ctx) {
        g_ctx->running = false;
    }
}

/* Initialize application */
static int app_init(app_context_t *ctx, int argc, char **argv)
{
    memset(ctx, 0, sizeof(*ctx));
    
    ctx->state = STATE_LOGIN;
    ctx->running = true;
    ctx->ball_count = 1;
    ctx->max_score = 5;
    ctx->allow_powerups = false;
    strcpy(ctx->game_mode, "1v1");
    ctx->use_ssl = true;
    
    /* Parse command line args */
    strncpy(ctx->host, DEFAULT_HOST, sizeof(ctx->host) - 1);
    ctx->port = DEFAULT_PORT;
    
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "-h") == 0 || strcmp(argv[i], "--host") == 0) {
            if (i + 1 < argc) {
                strncpy(ctx->host, argv[++i], sizeof(ctx->host) - 1);
            }
        } else if (strcmp(argv[i], "-p") == 0 || strcmp(argv[i], "--port") == 0) {
            if (i + 1 < argc) {
                ctx->port = atoi(argv[++i]);
            }
        } else if (strcmp(argv[i], "--no-ssl") == 0) {
            ctx->use_ssl = false;
        } else if (strcmp(argv[i], "--sound") == 0) {
            ctx->enable_sound = true;
        } else if (strcmp(argv[i], "--help") == 0) {
            printf("Pong CLI - Play Pong from the terminal\n\n");
            printf("Usage: %s [options]\n\n", argv[0]);
            printf("Options:\n");
            printf("  -h, --host HOST    Server hostname (default: %s)\n", DEFAULT_HOST);
            printf("  -p, --port PORT    Server port (default: %d)\n", DEFAULT_PORT);
            printf("  --no-ssl           Disable SSL/TLS\n");
            printf("  --sound            Enable sound effects (experimental)\n");
            printf("  --help             Show this help message\n");
            return -1;
        }
    }
    
    /* Suppress libwebsockets debug logging before ncurses init */
    lws_set_log_level(0, NULL);
    
    /* Initialize renderer FIRST */
    if (renderer_init() != 0) {
        fprintf(stderr, "Failed to initialize terminal renderer\n");
        return -1;
    }

    /* Try to load saved session */
    ctx->session = auth_load_session();
    if (ctx->session && auth_validate_session(ctx->session)) {
        ctx->state = STATE_MENU;
        /* Connect WebSocket for saved session */
        if (app_connect_ws(ctx) != 0) {
            /* Connection failed - need to re-login */
            auth_destroy_session(ctx->session);
            ctx->session = NULL;
            ctx->state = STATE_LOGIN;
            strcpy(ctx->login_error, "Session expired, please login again");
        }
    }
    
    return 0;
}

/* Cleanup application */
static void app_cleanup(app_context_t *ctx)
{
    if (ctx->game) {
        game_destroy(ctx->game);
        ctx->game = NULL;
    }
    
    if (ctx->ws) {
        ws_stop_service_thread(ctx->ws);
        ws_destroy(ctx->ws);
        ctx->ws = NULL;
    }
    
    if (ctx->session) {
        auth_destroy_session(ctx->session);
        ctx->session = NULL;
    }

    renderer_cleanup();
}

/* Connect WebSocket */
static int app_connect_ws(app_context_t *ctx)
{
    debug_log("app_connect_ws: starting\\n");
    
    /* Ensure session has host/port for refresh */
    if (ctx->session) {
        if (strlen(ctx->session->host) == 0) {
            snprintf(ctx->session->host, sizeof(ctx->session->host), "%s", ctx->host);
        }
        if (ctx->session->port == 0) {
            ctx->session->port = ctx->port;
        }
        
        /* Always refresh token before WebSocket connection */
        debug_log("app_connect_ws: refreshing token\\n");
        if (auth_refresh_token(ctx->session) != 0) {
            debug_log("app_connect_ws: token refresh failed, continuing with current token\\n");
        } else {
            debug_log("app_connect_ws: token refreshed successfully\\n");
        }
    }
    
    if (ctx->ws) {
        debug_log("app_connect_ws: destroying existing ws\\n");
        ws_stop_service_thread(ctx->ws);
        ws_destroy(ctx->ws);
    }
    
    debug_log("app_connect_ws: creating ws to %s:%d\\n", ctx->host, ctx->port);
    ctx->ws = ws_create(ctx->host, ctx->port, "/ws");
    if (!ctx->ws) {
        debug_log("app_connect_ws: ws_create failed\\n");
        return -1;
    }
    
    /* Set auth token */
    if (ctx->session) {
        debug_log("app_connect_ws: setting auth token\\n");
        ws_set_auth_token(ctx->ws, ctx->session->access_token);
    }
    
    /* Connect */
    debug_log("app_connect_ws: connecting\\n");
    if (ws_connect(ctx->ws) != 0) {
        debug_log("app_connect_ws: ws_connect failed\\n");
        ws_destroy(ctx->ws);
        ctx->ws = NULL;
        return -1;
    }
    debug_log("app_connect_ws: connected!\\n");
    
    /* Send authentication message */
    if (ctx->session && ctx->session->access_token[0]) {
        char auth_msg[2200];
        snprintf(auth_msg, sizeof(auth_msg), "{\"authorization\":\"%s\"}", ctx->session->access_token);
        debug_log("app_connect_ws: sending auth message\\n");
        ws_send_raw(ctx->ws, auth_msg, strlen(auth_msg));
    }
    
    /* Start service thread */
    ws_start_service_thread(ctx->ws);
    
    /* Create game state */
    if (ctx->game) {
        game_destroy(ctx->game);
    }
    ctx->game = game_create(ctx->ws, ctx->session->user_id);
    
    /* Subscribe invite-related WS handlers */
    app_subscribe_invite_handlers(ctx);
    
    return 0;
}

/* Handle login state */
static void handle_login(app_context_t *ctx)
{
    renderer_draw_login(ctx->username, ctx->password, 
                        ctx->login_field, ctx->login_error);
    
    int ch = renderer_get_input();
    if (ch == ERR) {
        usleep(16000);  /* ~60fps */
        return;
    }
    
    switch (ch) {
        case KEY_ESCAPE:
            ctx->running = false;
            break;
            
        case '\t':
            /* Switch field */
            ctx->login_field = (ctx->login_field + 1) % 2;
            break;
            
        case '\n':
        case KEY_ENTER:
            /* Attempt login */
            ctx->login_error[0] = '\0';
            
            if (strlen(ctx->username) == 0 || strlen(ctx->password) == 0) {
                strcpy(ctx->login_error, "Please fill in all fields");
                break;
            }
            
            renderer_draw_loading("Logging in...");
            
            auth_session_t *session = auth_login(ctx->host, ctx->port, 
                                                  ctx->username, ctx->password);
            
            if (session) {
                if (session->needs_2fa) {
                    if (ctx->session) auth_destroy_session(ctx->session);
                    ctx->session = session;
                    ctx->state = STATE_2FA;
                } else {
                    if (ctx->session) auth_destroy_session(ctx->session);
                    ctx->session = session;
                    auth_save_session(session);
                    ctx->state = STATE_MENU;
                    
                    /* Connect WebSocket */
                    if (app_connect_ws(ctx) != 0) {
                        strcpy(ctx->login_error, "Failed to connect to server");
                        ctx->state = STATE_LOGIN;
                    }
                }
            } else {
                strcpy(ctx->login_error, "Login failed");
            }
            break;
            
        case KEY_BACKSPACE:
        case 127:
        case '\b':
            /* Delete character */
            if (ctx->login_field == 0) {
                int len = strlen(ctx->username);
                if (len > 0) ctx->username[len - 1] = '\0';
            } else {
                int len = strlen(ctx->password);
                if (len > 0) ctx->password[len - 1] = '\0';
            }
            break;
            
        default:
            /* Add character (printable ASCII) */
            if (ch >= 32 && ch <= 126) {
                if (ctx->login_field == 0) {
                    int len = strlen(ctx->username);
                    if (len < MAX_INPUT_LEN - 1) {
                        ctx->username[len] = ch;
                        ctx->username[len + 1] = '\0';
                    }
                } else {
                    int len = strlen(ctx->password);
                    if (len < MAX_INPUT_LEN - 1) {
                        ctx->password[len] = ch;
                        ctx->password[len + 1] = '\0';
                    }
                }
            }
            break;
    }
}

/* Handle 2FA state */
static void handle_2fa(app_context_t *ctx)
{
    renderer_draw_2fa(ctx->totp_code, ctx->login_error);
    
    int ch = renderer_get_input();
    if (ch == ERR) {
        usleep(16000);
        return;
    }
    
    switch (ch) {
        case KEY_ESCAPE:
            ctx->state = STATE_LOGIN;
            ctx->totp_code[0] = '\0';
            ctx->login_error[0] = '\0';
            break;
            
        case '\n':
        case KEY_ENTER:
            if (strlen(ctx->totp_code) != 6) {
                strcpy(ctx->login_error, "2FA code must be 6 digits");
                break;
            }
            
            renderer_draw_loading("Verifying...");
            
            if (auth_verify_2fa(ctx->session, ctx->totp_code) == 0) {
                auth_save_session(ctx->session);
                ctx->state = STATE_MENU;
                
                if (app_connect_ws(ctx) != 0) {
                    strcpy(ctx->login_error, "Failed to connect");
                    auth_destroy_session(ctx->session);
                    ctx->session = NULL;
                    ctx->state = STATE_LOGIN;
                }
            } else {
                strcpy(ctx->login_error, "Invalid 2FA code");
            }
            ctx->totp_code[0] = '\0';
            break;
            
        case KEY_BACKSPACE:
        case 127:
        case '\b':
            {
                int len = strlen(ctx->totp_code);
                if (len > 0) ctx->totp_code[len - 1] = '\0';
            }
            break;
            
        default:
            if (ch >= '0' && ch <= '9') {
                int len = strlen(ctx->totp_code);
                if (len < 6) {
                    ctx->totp_code[len] = ch;
                    ctx->totp_code[len + 1] = '\0';
                }
            }
            break;
    }
}

/* Main menu options */
static const char *menu_options[] = {
    "Play vs AI",
    "Create Lobby",
    "Invite Player",
    "Settings",
    "Logout",
    "Quit"
};
static const int menu_option_count = 6;

/* Handle main menu */
static void handle_menu(app_context_t *ctx)
{
    /* Check for pending invitations */
    if (ctx->game) {
        pthread_mutex_lock(&ctx->game->mutex);
        bool invited = ctx->game->invitation_pending;
        pthread_mutex_unlock(&ctx->game->mutex);
        
        if (invited) {
            /* Show invitation screen so user can accept or decline */
            ctx->state = STATE_INVITATION;
            return;
        }
    }
    
    renderer_draw_menu(menu_options, menu_option_count, 
                       ctx->menu_selection, "Main Menu");
    
    int ch = renderer_get_input();
    if (ch == ERR) {
        usleep(16000);
        return;
    }
    
    switch (ch) {
        case KEY_UP:
        case 'w':
        case 'W':
            if (ctx->menu_selection > 0) {
                ctx->menu_selection--;
            }
            break;
            
        case KEY_DOWN:
        case 's':
        case 'S':
            if (ctx->menu_selection < menu_option_count - 1) {
                ctx->menu_selection++;
            }
            break;
            
        case '\n':
        case KEY_ENTER:
            switch (ctx->menu_selection) {
                case 0:  /* Play vs AI */
                    debug_log("Play vs AI selected\\n");
                    debug_log("ctx->game=%p ctx->ws=%p ctx->session=%p\\n", 
                              (void*)ctx->game, (void*)ctx->ws, (void*)ctx->session);
                    if (!ctx->session) {
                        debug_log("No session!\\n");
                        strcpy(ctx->login_error, "Not logged in");
                        break;
                    }
                    if (!ctx->game || !ctx->ws) {
                        debug_log("No game/ws connection!\\n");
                        strcpy(ctx->login_error, "Not connected to server");
                        break;
                    }
                    /* Create a 1v1 lobby with AI opponents from settings */
                    {
                        int ai = ctx->ai_count > 0 ? ctx->ai_count : 1;
                        debug_log("Creating AI lobby for user_id=%d ai=%d\\n", ctx->session->user_id, ai);
                        int player_ids[] = { ctx->session->user_id };
                        int result = game_create_lobby(ctx->game, "1v1",
                                              player_ids, NULL, 1,
                                              ctx->ball_count, ctx->max_score,
                                              ctx->allow_powerups, ai);
                        debug_log("game_create_lobby returned %d\\n", result);
                        if (result == 0) {
                            ctx->state = STATE_LOBBY;
                        } else {
                            strcpy(ctx->login_error, "Failed to create lobby");
                        }
                    }
                    break;
                    
                case 1:  /* Create Lobby */
                    debug_log("Create Lobby selected\\n");
                    if (!ctx->session) {
                        strcpy(ctx->login_error, "Not logged in");
                        break;
                    }
                    if (!ctx->game || !ctx->ws) {
                        strcpy(ctx->login_error, "Not connected to server");
                        break;
                    }
                    {
                        debug_log("Creating lobby mode=%s user_id=%d ai=%d\\n", ctx->game_mode, ctx->session->user_id, ctx->ai_count);
                        int player_ids[] = { ctx->session->user_id };
                        if (game_create_lobby(ctx->game, ctx->game_mode,
                                              player_ids, NULL, 1,
                                              ctx->ball_count, ctx->max_score,
                                              ctx->allow_powerups, ctx->ai_count) == 0) {
                            ctx->state = STATE_LOBBY;
                        } else {
                            strcpy(ctx->login_error, "Failed to create lobby");
                        }
                    }
                    break;
                    
                case 2:  /* Invite Player */
                    if (!ctx->session) {
                        strcpy(ctx->login_error, "Not logged in");
                        break;
                    }
                    if (!ctx->game || !ctx->ws) {
                        strcpy(ctx->login_error, "Not connected to server");
                        break;
                    }
                    /* Reset invite state and request online users */
                    ctx->online_user_count = 0;
                    ctx->invite_selection = 0;
                    ctx->invite_search[0] = '\0';
                    ctx->invite_search_mode = false;
                    ctx->invite_fetching = true;
                    for (int i = 0; i < MAX_ONLINE_USERS; i++)
                        ctx->online_users[i].selected = false;
                    /* Request online user IDs */
                    ws_send_message(ctx->ws, "users",
                                    "user_online_status_update", "null");
                    ctx->state = STATE_INVITE;
                    break;
                    
                case 3:  /* Settings */
                    ctx->state = STATE_SETTINGS;
                    break;
                    
                case 4:  /* Logout */
                    /* Cleanup WebSocket and game first */
                    if (ctx->game) {
                        game_destroy(ctx->game);
                        ctx->game = NULL;
                    }
                    if (ctx->ws) {
                        ws_stop_service_thread(ctx->ws);
                        ws_destroy(ctx->ws);
                        ctx->ws = NULL;
                    }
                    auth_logout(ctx->session);
                    auth_destroy_session(ctx->session);
                    ctx->session = NULL;
                    ctx->state = STATE_LOGIN;
                    ctx->username[0] = '\0';
                    ctx->password[0] = '\0';
                    break;
                    
                case 5:  /* Quit */
                    ctx->running = false;
                    break;
            }
            break;
            
        case 'q':
        case 'Q':
            ctx->running = false;
            break;
    }
}

/* ============================================================
 * Invite / Online-users helpers
 * ============================================================ */

/* WS callback: user_online_status_update -> list of online user IDs */
static void on_online_user_ids(const char *func_id, int code,
                               const char *payload, void *user_data)
{
    (void)func_id;
    app_context_t *ctx = (app_context_t *)user_data;
    
    /* code 0 = GetOnlineUsers (array of user IDs) */
    if (code != 0 || !payload) return;
    
    debug_log("on_online_user_ids: payload=%s\\n", payload);
    
    cJSON *root = cJSON_Parse(payload);
    if (!root || !cJSON_IsArray(root)) {
        if (root) cJSON_Delete(root);
        ctx->invite_fetching = false;
        return;
    }
    
    ctx->online_user_count = 0;
    cJSON *item;
    cJSON_ArrayForEach(item, root) {
        if (cJSON_IsNumber(item) && ctx->online_user_count < MAX_ONLINE_USERS) {
            int uid = item->valueint;
            /* Skip self */
            if (ctx->session && uid == ctx->session->user_id) continue;
            ctx->online_users[ctx->online_user_count].id = uid;
            ctx->online_users[ctx->online_user_count].username[0] = '\0';
            ctx->online_users[ctx->online_user_count].selected = false;
            ctx->online_user_count++;
        }
    }
    cJSON_Delete(root);
    
    /* Now request profile for each user to get usernames */
    for (int i = 0; i < ctx->online_user_count && ctx->ws; i++) {
        char id_str[32];
        snprintf(id_str, sizeof(id_str), "%d", ctx->online_users[i].id);
        ws_send_message(ctx->ws, "users", "user_profile", id_str);
    }
    
    if (ctx->online_user_count == 0)
        ctx->invite_fetching = false;
}

/* WS callback: user_profile -> PublicUserData with username */
static void on_user_profile(const char *func_id, int code,
                            const char *payload, void *user_data)
{
    (void)func_id;
    app_context_t *ctx = (app_context_t *)user_data;
    
    /* code 0 = Success */
    if (code != 0 || !payload) return;
    
    debug_log("on_user_profile: payload=%.200s\\n", payload);
    
    cJSON *root = cJSON_Parse(payload);
    if (!root) return;
    
    cJSON *uid_j = cJSON_GetObjectItem(root, "id");
    cJSON *uname_j = cJSON_GetObjectItem(root, "username");
    
    if (uid_j && cJSON_IsNumber(uid_j) && uname_j && cJSON_IsString(uname_j)) {
        int uid = uid_j->valueint;
        /* Skip self */
        if (ctx->session && uid == ctx->session->user_id) {
            cJSON_Delete(root);
            ctx->invite_fetching = false;
            return;
        }
        bool found = false;
        for (int i = 0; i < ctx->online_user_count; i++) {
            if (ctx->online_users[i].id == uid) {
                strncpy(ctx->online_users[i].username,
                        uname_j->valuestring,
                        sizeof(ctx->online_users[i].username) - 1);
                found = true;
                break;
            }
        }
        /* If this user came from a username search, add to list */
        if (!found && ctx->online_user_count < MAX_ONLINE_USERS) {
            int idx = ctx->online_user_count++;
            ctx->online_users[idx].id = uid;
            strncpy(ctx->online_users[idx].username,
                    uname_j->valuestring,
                    sizeof(ctx->online_users[idx].username) - 1);
            ctx->online_users[idx].username[sizeof(ctx->online_users[idx].username) - 1] = '\0';
            ctx->online_users[idx].selected = false;
        }
    }
    
    /* Check if we have all usernames — then stop the spinner */
    bool all_done = true;
    for (int i = 0; i < ctx->online_user_count; i++) {
        if (ctx->online_users[i].username[0] == '\0') {
            all_done = false;
            break;
        }
    }
    if (all_done)
        ctx->invite_fetching = false;
    
    cJSON_Delete(root);
}

/* Subscribe invite-related WS handlers (called once after connect) */
static void app_subscribe_invite_handlers(app_context_t *ctx)
{
    if (!ctx->ws) return;
    ws_subscribe(ctx->ws, "user_online_status_update",
                 on_online_user_ids, ctx);
    ws_subscribe(ctx->ws, "user_profile",
                 on_user_profile, ctx);
}

/* Handle invite / player selection screen */
static void handle_invite(app_context_t *ctx)
{
    if (!ctx->ws || !ctx->session) {
        ctx->state = STATE_MENU;
        return;
    }
    
    /* Timeout after 5 seconds of fetching */
    static time_t fetch_start = 0;
    if (ctx->invite_fetching) {
        if (fetch_start == 0) fetch_start = time(NULL);
        if (time(NULL) - fetch_start > 5) {
            ctx->invite_fetching = false;
        }
    } else {
        fetch_start = 0;
    }
    
    renderer_draw_invite(ctx->online_users, ctx->online_user_count,
                         ctx->invite_selection, ctx->session->user_id,
                         ctx->invite_search, ctx->invite_search_mode);
    
    int ch = renderer_get_input();
    if (ch == ERR) {
        usleep(50000);
        return;
    }
    
    /* Search mode: typing a username */
    if (ctx->invite_search_mode) {
        switch (ch) {
            case '\n':
            case KEY_ENTER:
                /* Send user_profile request by username to search */
                if (strlen(ctx->invite_search) > 0) {
                    /* Format as JSON string */
                    char search_payload[128];
                    snprintf(search_payload, sizeof(search_payload),
                             "\"%s\"", ctx->invite_search);
                    ws_send_message(ctx->ws, "users", "user_profile",
                                    search_payload);
                    ctx->invite_fetching = true;
                    fetch_start = time(NULL);
                }
                ctx->invite_search_mode = false;
                break;
                
            case KEY_ESCAPE:
                ctx->invite_search_mode = false;
                ctx->invite_search[0] = '\0';
                break;
                
            case KEY_BACKSPACE:
            case 127:
            case '\b':
                {
                    int len = strlen(ctx->invite_search);
                    if (len > 0) ctx->invite_search[len - 1] = '\0';
                }
                break;
                
            default:
                if (ch >= 32 && ch <= 126) {
                    int len = strlen(ctx->invite_search);
                    if (len < (int)sizeof(ctx->invite_search) - 1) {
                        ctx->invite_search[len] = ch;
                        ctx->invite_search[len + 1] = '\0';
                    }
                }
                break;
        }
        return;
    }
    
    /* Normal navigation mode */
    switch (ch) {
        case KEY_UP:
        case 'w':
        case 'W':
            if (ctx->invite_selection > 0)
                ctx->invite_selection--;
            break;
            
        case KEY_DOWN:
        case 's':
        case 'S':
            if (ctx->invite_selection < ctx->online_user_count - 1)
                ctx->invite_selection++;
            break;
            
        case ' ':  /* Toggle selection */
            if (ctx->invite_selection >= 0 &&
                ctx->invite_selection < ctx->online_user_count) {
                ctx->online_users[ctx->invite_selection].selected =
                    !ctx->online_users[ctx->invite_selection].selected;
            }
            break;
            
        case '/':  /* Enter search mode */
            ctx->invite_search_mode = true;
            ctx->invite_search[0] = '\0';
            break;
            
        case 'r':
        case 'R':
            /* Refresh: re-request online users */
            ctx->online_user_count = 0;
            ctx->invite_fetching = true;
            ws_send_message(ctx->ws, "users",
                            "user_online_status_update", "null");
            break;
            
        case '\n':
        case KEY_ENTER:
        {
            /* Create lobby with selected players */
            int selected_count = 0;
            for (int i = 0; i < ctx->online_user_count; i++) {
                if (ctx->online_users[i].selected)
                    selected_count++;
            }
            
            /* Build player ID + username arrays (self + selected) */
            int total = 1 + selected_count;
            int player_ids[MAX_ONLINE_USERS + 1];
            const char *player_names[MAX_ONLINE_USERS + 1];
            
            player_ids[0] = ctx->session->user_id;
            player_names[0] = ctx->session->username;
            
            int idx = 1;
            for (int i = 0; i < ctx->online_user_count; i++) {
                if (ctx->online_users[i].selected) {
                    player_ids[idx] = ctx->online_users[i].id;
                    player_names[idx] = ctx->online_users[i].username;
                    idx++;
                }
            }
            
            debug_log("Creating invite lobby: total=%d mode=%s\\n",
                      total, ctx->game_mode);
            
            if (game_create_lobby(ctx->game, ctx->game_mode,
                                  player_ids, player_names, total,
                                  ctx->ball_count, ctx->max_score,
                                  ctx->allow_powerups, ctx->ai_count) == 0) {
                ctx->state = STATE_LOBBY;
            } else {
                strcpy(ctx->login_error, "Failed to create lobby");
                ctx->state = STATE_MENU;
            }
            break;
        }
            
        case 'q':
        case 'Q':
        case KEY_ESCAPE:
            ctx->state = STATE_MENU;
            break;
    }
}

/* Handle incoming game invitation */
static void handle_invitation(app_context_t *ctx)
{
    if (!ctx->game || !ctx->ws) {
        ctx->state = STATE_MENU;
        return;
    }

    pthread_mutex_lock(&ctx->game->mutex);
    lobby_t lobby_copy = ctx->game->lobby;
    int my_id = ctx->game->my_user_id;
    pthread_mutex_unlock(&ctx->game->mutex);

    renderer_draw_invitation(&lobby_copy, my_id);

    int ch = renderer_get_input();
    if (ch == ERR) {
        usleep(50000);
        return;
    }

    switch (ch) {
        case 'a':
        case 'A':
        case '\n':
        case KEY_ENTER:
            /* Accept: clear pending flag and go to lobby */
            pthread_mutex_lock(&ctx->game->mutex);
            ctx->game->invitation_pending = false;
            pthread_mutex_unlock(&ctx->game->mutex);
            ctx->state = STATE_LOBBY;
            break;

        case 'd':
        case 'D':
        case 27: /* ESC */
        case 'q':
        case 'Q': {
            /* Decline: send decline message and return to menu */
            pthread_mutex_lock(&ctx->game->mutex);
            int lobby_id = ctx->game->lobby.id;
            ctx->game->invitation_pending = false;
            ctx->game->in_lobby = false;
            pthread_mutex_unlock(&ctx->game->mutex);

            cJSON *payload = cJSON_CreateObject();
            cJSON_AddNumberToObject(payload, "lobbyId", lobby_id);
            char *json = cJSON_PrintUnformatted(payload);
            cJSON_Delete(payload);
            if (json) {
                ws_send_message(ctx->ws, "pong",
                                "decline_lobby_invitation", json);
                free(json);
            }
            ctx->state = STATE_MENU;
            break;
        }
    }
}

/* Handle matchmaking */
static void handle_matchmaking(app_context_t *ctx)
{
    int elapsed = (int)(time(NULL) - ctx->match_start_time);
    renderer_draw_matchmaking(ctx->game_mode, elapsed);
    
    int ch = renderer_get_input();
    if (ch == ERR) {
        usleep(100000);  /* 100ms for matchmaking screen */
        return;
    }
    
    if (ch == 'q' || ch == 'Q' || ch == KEY_ESCAPE) {
        /* Cancel matchmaking */
        ctx->state = STATE_MENU;
    }
    
    /* Check for match found */
    if (ctx->game && game_is_active(ctx->game)) {
        ctx->state = STATE_IN_GAME;
    }
}

/* Handle lobby */
static void handle_lobby(app_context_t *ctx)
{
    if (!ctx->game) {
        ctx->state = STATE_MENU;
        return;
    }
    
    renderer_draw_lobby(&ctx->game->lobby, ctx->session->user_id);
    
    /* AI auto-ready/start is handled in on_lobby_update callback
       (game.c) so it fires with the correct lobby_id immediately
       upon receiving the server response.  No polling needed here. */

    int ch = renderer_get_input();
    if (ch == ERR) {
        usleep(50000);
    } else {
        switch (ch) {
            case 'r':
            case 'R':
                game_toggle_ready(ctx->game);
                break;
                
            case 's':
            case 'S':
                game_start_from_lobby(ctx->game);
                break;
                
            case 'q':
            case 'Q':
                game_leave_lobby(ctx->game);
                ctx->state = STATE_MENU;
                return;
        }
    }
    
    /* Check if game started */
    if (game_is_active(ctx->game)) {
        ctx->state = STATE_IN_GAME;
    }
}

/* Handle in-game state */
static void handle_in_game(app_context_t *ctx)
{
    if (!ctx->game) {
        ctx->state = STATE_MENU;
        return;
    }
    
    renderer_draw_game(ctx->game);
    
    int ch = renderer_get_input();
    
    if (ch != ERR) {
        switch (ch) {
            case 'q':
            case 'Q':
                renderer_reset_input();  /* Ensure input mode is correct */
                /* Properly reset game state so a new lobby can be created */
                pthread_mutex_lock(&ctx->game->mutex);
                ctx->game->game_active = false;
                ctx->game->game_over = false;
                ctx->game->in_lobby = false;
                ctx->game->auto_start_sent = false;
                ctx->game->lobby.id = 0;
                ctx->game->ball_count = 0;
                ctx->game->paddle_count = 0;
                ctx->game->wall_count = 0;
                ctx->game->powerup_count = 0;
                ctx->game->player_count = 0;
                pthread_mutex_unlock(&ctx->game->mutex);
                ctx->state = STATE_MENU;
                return;
                
            case 'w':
            case 'W':
            case KEY_UP:
            case KEY_LEFT:
            case 'a':
            case 'A':
                game_set_key_up(ctx->game, true);
                game_set_key_down(ctx->game, false);
                break;
                
            case 's':
            case 'S':
            case KEY_DOWN:
            case KEY_RIGHT:
            case 'd':
            case 'D':
                game_set_key_up(ctx->game, false);
                game_set_key_down(ctx->game, true);
                break;
                
            default:
                /* Release keys */
                game_set_key_up(ctx->game, false);
                game_set_key_down(ctx->game, false);
                break;
        }
    }
    
    /* Send input to server every frame */
    game_send_input(ctx->game);

    /* Check game over */
    pthread_mutex_lock(&ctx->game->mutex);
    bool game_over = ctx->game->game_over;
    pthread_mutex_unlock(&ctx->game->mutex);

    if (game_over) {
        ctx->state = STATE_GAME_OVER;
    }
    
    usleep(16000);  /* ~60fps */
}

/* Handle game over */
static void handle_game_over(app_context_t *ctx)
{
    if (!ctx->game) {
        ctx->state = STATE_MENU;
        return;
    }
    
    renderer_draw_game_over(ctx->game);
    
    int ch = renderer_get_input();
    if (ch != ERR) {
        ctx->state = STATE_MENU;
    }
    
    usleep(50000);
}

/* Settings */
static const char *settings_names[] = {
    "Ball Count",
    "Max Score",
    "Powerups",
    "Game Mode",
    "AI Opponents"
};
static const int settings_count = 5;

/* Handle settings */
static void handle_settings(app_context_t *ctx)
{
    static int setting_sel = 0;
    
    char values[5][32];
    snprintf(values[0], sizeof(values[0]), "%d", ctx->ball_count);
    snprintf(values[1], sizeof(values[1]), "%d", ctx->max_score);
    snprintf(values[2], sizeof(values[2]), "%s", ctx->allow_powerups ? "On" : "Off");
    snprintf(values[3], sizeof(values[3]), "%s", ctx->game_mode);
    snprintf(values[4], sizeof(values[4]), "%d", ctx->ai_count);
    
    const char *value_ptrs[5] = { values[0], values[1], values[2], values[3], values[4] };
    
    renderer_draw_settings(settings_names, value_ptrs, settings_count, setting_sel);
    
    int ch = renderer_get_input();
    if (ch == ERR) {
        usleep(16000);
        return;
    }
    
    switch (ch) {
        case KEY_UP:
        case 'w':
        case 'W':
            if (setting_sel > 0) setting_sel--;
            break;
            
        case KEY_DOWN:
        case 's':
        case 'S':
            if (setting_sel < settings_count - 1) setting_sel++;
            break;
            
        case KEY_LEFT:
        case KEY_RIGHT:
            {
                int delta = (ch == KEY_LEFT) ? -1 : 1;
                switch (setting_sel) {
                    case 0:  /* Ball count */
                        ctx->ball_count += delta;
                        if (ctx->ball_count < 1) ctx->ball_count = 1;
                        if (ctx->ball_count > 5) ctx->ball_count = 5;
                        break;
                        
                    case 1:  /* Max score */
                        ctx->max_score += delta;
                        if (ctx->max_score < 1) ctx->max_score = 1;
                        if (ctx->max_score > 21) ctx->max_score = 21;
                        break;
                        
                    case 2:  /* Powerups */
                        ctx->allow_powerups = !ctx->allow_powerups;
                        break;
                        
                    case 3:  /* Game mode */
                        if (strcmp(ctx->game_mode, "1v1") == 0) {
                            strcpy(ctx->game_mode, "multiplayer");
                        } else if (strcmp(ctx->game_mode, "multiplayer") == 0) {
                            strcpy(ctx->game_mode, "lastOneStanding");
                        } else {
                            strcpy(ctx->game_mode, "1v1");
                        }
                        break;
                        
                    case 4:  /* AI Opponents */
                        ctx->ai_count += delta;
                        if (ctx->ai_count < 0) ctx->ai_count = 0;
                        if (ctx->ai_count > 7) ctx->ai_count = 7;
                        break;
                }
            }
            break;
            
        case '\n':
        case KEY_ENTER:
        case KEY_ESCAPE:
            ctx->state = STATE_MENU;
            break;
    }
}

/* Main loop */
static void app_run(app_context_t *ctx)
{
    while (ctx->running) {
        switch (ctx->state) {
            case STATE_LOGIN:
                handle_login(ctx);
                break;
                
            case STATE_2FA:
                handle_2fa(ctx);
                break;
                
            case STATE_MENU:
                handle_menu(ctx);
                break;
                
            case STATE_MATCHMAKING:
                handle_matchmaking(ctx);
                break;
                
            case STATE_LOBBY:
                handle_lobby(ctx);
                break;
                
            case STATE_IN_GAME:
                handle_in_game(ctx);
                break;
                
            case STATE_GAME_OVER:
                handle_game_over(ctx);
                break;
                
            case STATE_SETTINGS:
                handle_settings(ctx);
                break;
                
            case STATE_INVITE:
                handle_invite(ctx);
                break;

            case STATE_INVITATION:
                handle_invitation(ctx);
                break;
                
            default:
                ctx->state = STATE_LOGIN;
                break;
        }
    }
}

/* Entry point */
int main(int argc, char **argv)
{
    app_context_t ctx;
    g_ctx = &ctx;
    
    /* Set up signal handlers */
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);
    signal(SIGSEGV, crash_handler);
    signal(SIGABRT, crash_handler);
    
    debug_log("Starting pong-cli\\n");
    
    /* Initialize */
    if (app_init(&ctx, argc, argv) != 0) {
        return 1;
    }
    
    /* Show intro animation with starfield */
    renderer_play_intro();
    
    /* Run main loop */
    app_run(&ctx);
    
    /* Cleanup */
    app_cleanup(&ctx);
    
    printf("Thanks for playing Pong CLI!\n");
    
    return 0;
}
