#ifndef RENDERER_H
#define RENDERER_H

#include <ncurses.h>
#include <stdbool.h>
#include "pong_cli.h"
#include "game.h"

typedef struct terminal_renderer {
    WINDOW          *main_win;
    WINDOW          *game_win;
    WINDOW          *status_win;
    int             term_width;
    int             term_height;
} pong_renderer_t;

int                 renderer_init(void);
void                renderer_cleanup(void);

void                renderer_clear(void);
void                renderer_refresh(void);
int                 renderer_get_input(void);
void                renderer_get_size(int *width, int *height);
void                renderer_reset_input(void);

void                renderer_play_intro(void);

void                renderer_draw_title(void);
void                renderer_draw_login(const char *username, const char *password,
                                         int cursor_field, const char *error_msg);
void                renderer_draw_2fa(const char *code, const char *error_msg);
void                renderer_draw_menu(const char **options, int option_count,
                                        int selected, const char *title);
void                renderer_draw_lobby(lobby_t *lobby, int my_user_id);
void                renderer_draw_game(game_state_t *game);
void                renderer_draw_game_over(game_state_t *game);
void                renderer_draw_waiting(const char *message);
void                renderer_draw_loading(const char *message);
void                renderer_draw_matchmaking(const char *mode, int elapsed_seconds);
void                renderer_draw_error(const char *title, const char *message);
void                renderer_draw_settings(const char **settings, const char **values,
                                            int setting_count, int selected);
void                renderer_draw_invite(online_user_t *users, int user_count,
                                        int selected, int my_user_id,
                                        const char *search_query, bool searching);
void                renderer_draw_invitation(lobby_t *lobby, int my_user_id);

#endif
