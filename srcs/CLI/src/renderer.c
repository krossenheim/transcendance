#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <locale.h>
#include <time.h>
#include "renderer.h"
#include "game.h"
#include "starfield.h"

#define COLOR_BALL          1
#define COLOR_PADDLE        2
#define COLOR_WALL          3
#define COLOR_SCORE         4
#define COLOR_MENU          5
#define COLOR_SELECTED      6
#define COLOR_TITLE         7
#define COLOR_ERROR         8
#define COLOR_POWERUP       9
#define COLOR_PADDLE_OPP    10
#define COLOR_MIDLINE       11

#define COLOR_PLAYER_BASE 12
#define MAX_PLAYER_COLORS 12

static pong_renderer_t g_renderer;
static bool g_initialized = false;

static starfield_t g_bg_starfield;
static bool g_bg_starfield_active = false;
static struct timespec g_bg_sf_prev;
static bool g_bg_sf_timer_init = false;

static const char *powerup_type_label(int type)
{
    switch (type) {
        case PWRUP_ADD_BALL:              return "+Ball";
        case PWRUP_INCREASE_PADDLE_SPEED: return "FastPaddle";
        case PWRUP_DECREASE_PADDLE_SPEED: return "SlowPaddle";
        case PWRUP_SUPER_SPEED:           return "SuperSpeed";
        case PWRUP_INCREASE_BALL_SIZE:    return "BigBall";
        case PWRUP_DECREASE_BALL_SIZE:    return "SmallBall";
        case PWRUP_REVERSE_CONTROLS:      return "Reversed!";
        default:                          return "???";
    }
}

/* Return a character for the pickup icon on the field */
static char powerup_field_char(int type)
{
    switch (type) {
        case PWRUP_ADD_BALL:              return '+';
        case PWRUP_INCREASE_PADDLE_SPEED: return 'F';
        case PWRUP_DECREASE_PADDLE_SPEED: return 'S';
        case PWRUP_SUPER_SPEED:           return '!';
        case PWRUP_INCREASE_BALL_SIZE:    return 'B';
        case PWRUP_DECREASE_BALL_SIZE:    return 'b';
        case PWRUP_REVERSE_CONTROLS:      return 'R';
        default:                          return '?';
    }
}

/* Initialize ncurses */
int renderer_init(void)
{
    if (g_initialized) return 0;
    
    setlocale(LC_ALL, "");
    
    set_escdelay(25);
    
    initscr();
    
    clear();
    refresh();
    
    cbreak();
    noecho();
    keypad(stdscr, TRUE);
    nodelay(stdscr, TRUE);
    curs_set(0);
    scrollok(stdscr, FALSE);
    
    /* Initialize colors */
    if (has_colors()) {
        start_color();
        use_default_colors();
        
        init_pair(COLOR_BALL, COLOR_YELLOW, -1);
        init_pair(COLOR_PADDLE, COLOR_CYAN, -1);
        init_pair(COLOR_WALL, COLOR_BLUE, -1);
        init_pair(COLOR_SCORE, COLOR_YELLOW, -1);
        init_pair(COLOR_MENU, COLOR_WHITE, -1);
        init_pair(COLOR_SELECTED, COLOR_BLACK, COLOR_WHITE);
        init_pair(COLOR_TITLE, COLOR_GREEN, -1);
        init_pair(COLOR_ERROR, COLOR_RED, -1);
        init_pair(COLOR_POWERUP, COLOR_MAGENTA, -1);
        init_pair(COLOR_PADDLE_OPP, COLOR_MAGENTA, -1);
        init_pair(COLOR_MIDLINE, COLOR_GREEN, -1);
        
        if (COLORS >= 256) {
            init_pair(COLOR_PLAYER_BASE + 0, 46, -1);   /* Green */
            init_pair(COLOR_PLAYER_BASE + 1, 33, -1);   /* Blue */
            init_pair(COLOR_PLAYER_BASE + 2, 208, -1);  /* Orange */
            init_pair(COLOR_PLAYER_BASE + 3, 201, -1);  /* Magenta */
            init_pair(COLOR_PLAYER_BASE + 4, 226, -1);  /* Yellow */
            init_pair(COLOR_PLAYER_BASE + 5, 51, -1);   /* Cyan */
            init_pair(COLOR_PLAYER_BASE + 6, 135, -1);  /* Purple */
            init_pair(COLOR_PLAYER_BASE + 7, 197, -1);  /* Pink */
            init_pair(COLOR_PLAYER_BASE + 8, 196, -1);  /* Red */
            init_pair(COLOR_PLAYER_BASE + 9, 43, -1);   /* Teal */
            init_pair(COLOR_PLAYER_BASE + 10, 209, -1); /* Coral */
            init_pair(COLOR_PLAYER_BASE + 11, 118, -1); /* Lime */
        } else {
            init_pair(COLOR_PLAYER_BASE + 0, COLOR_GREEN, -1);
            init_pair(COLOR_PLAYER_BASE + 1, COLOR_BLUE, -1);
            init_pair(COLOR_PLAYER_BASE + 2, COLOR_YELLOW, -1);
            init_pair(COLOR_PLAYER_BASE + 3, COLOR_MAGENTA, -1);
            init_pair(COLOR_PLAYER_BASE + 4, COLOR_YELLOW, -1);
            init_pair(COLOR_PLAYER_BASE + 5, COLOR_CYAN, -1);
            init_pair(COLOR_PLAYER_BASE + 6, COLOR_MAGENTA, -1);
            init_pair(COLOR_PLAYER_BASE + 7, COLOR_RED, -1);
            init_pair(COLOR_PLAYER_BASE + 8, COLOR_RED, -1);
            init_pair(COLOR_PLAYER_BASE + 9, COLOR_CYAN, -1);
            init_pair(COLOR_PLAYER_BASE + 10, COLOR_WHITE, -1);
            init_pair(COLOR_PLAYER_BASE + 11, COLOR_GREEN, -1);
        }
    }
    
    getmaxyx(stdscr, g_renderer.term_height, g_renderer.term_width);
    
    g_renderer.main_win = newwin(g_renderer.term_height, g_renderer.term_width, 0, 0);
    keypad(g_renderer.main_win, TRUE);
    nodelay(g_renderer.main_win, TRUE);
    g_renderer.game_win = NULL;
    g_renderer.status_win = NULL;
    
    g_initialized = true;
    
    return 0;
}

/* Cleanup ncurses */
void renderer_cleanup(void)
{
    if (!g_initialized) return;
    
    if (g_renderer.game_win) {
        delwin(g_renderer.game_win);
        g_renderer.game_win = NULL;
    }
    
    if (g_renderer.status_win) {
        delwin(g_renderer.status_win);
        g_renderer.status_win = NULL;
    }
    
    if (g_renderer.main_win) {
        delwin(g_renderer.main_win);
        g_renderer.main_win = NULL;
    }
    
    endwin();
    g_initialized = false;
}

/* Clear screen */
void renderer_clear(void)
{
    clear();
    if (g_renderer.main_win) {
        werase(g_renderer.main_win);
        touchwin(g_renderer.main_win);
    }
}

/* Reset input mode (call after state transitions) */
void renderer_reset_input(void)
{
    keypad(stdscr, TRUE);
    nodelay(stdscr, TRUE);
    if (g_renderer.main_win) {
        keypad(g_renderer.main_win, TRUE);
        nodelay(g_renderer.main_win, TRUE);
    }
}

/* Refresh screen */
void renderer_refresh(void)
{
    touchwin(stdscr);
    wnoutrefresh(stdscr);
    
    if (g_renderer.main_win) {
        touchwin(g_renderer.main_win);
        wnoutrefresh(g_renderer.main_win);
    }
    if (g_renderer.game_win) {
        touchwin(g_renderer.game_win);
        wnoutrefresh(g_renderer.game_win);
    }
    if (g_renderer.status_win) {
        touchwin(g_renderer.status_win);
        wnoutrefresh(g_renderer.status_win);
    }
    
    doupdate();
}

/* Get input */
int renderer_get_input(void)
{
    return wgetch(g_renderer.main_win);
}

/* Get terminal size */
void renderer_get_size(int *width, int *height)
{
    getmaxyx(stdscr, g_renderer.term_height, g_renderer.term_width);
    if (width) *width = g_renderer.term_width;
    if (height) *height = g_renderer.term_height;
}

/* Draw centered text */
static void draw_centered(WINDOW *win, int y, const char *text, int color_pair)
{
    int width;
    int height;
    getmaxyx(win, height, width);
    (void)height;
    
    int x = (width - (int)strlen(text)) / 2;
    if (x < 0) x = 0;
    
    if (color_pair > 0) wattron(win, COLOR_PAIR(color_pair));
    mvwprintw(win, y, x, "%s", text);
    if (color_pair > 0) wattroff(win, COLOR_PAIR(color_pair));
}

/* Draw box around window */
static void draw_border(WINDOW *win, const char *title)
{
    box(win, 0, 0);
    
    if (title && strlen(title) > 0) {
        int width;
        int height;
        getmaxyx(win, height, width);
        (void)height;
        
        int x = (width - (int)strlen(title) - 4) / 2;
        if (x < 2) x = 2;
        
        wattron(win, COLOR_PAIR(COLOR_TITLE) | A_BOLD);
        mvwprintw(win, 0, x, "[ %s ]", title);
        wattroff(win, COLOR_PAIR(COLOR_TITLE) | A_BOLD);
    }
}

/* Update and draw the persistent background starfield */
static void draw_bg_starfield(void)
{
    if (!g_bg_starfield_active) return;

    struct timespec now;
    clock_gettime(CLOCK_MONOTONIC, &now);

    float dt;
    if (g_bg_sf_timer_init) {
        dt = (float)(now.tv_sec - g_bg_sf_prev.tv_sec) +
             (float)(now.tv_nsec - g_bg_sf_prev.tv_nsec) / 1e9f;
        if (dt > 0.1f) dt = 0.1f;
    } else {
        dt = 0.016f;
        g_bg_sf_timer_init = true;
    }
    g_bg_sf_prev = now;

    int w, h;
    getmaxyx(g_renderer.main_win, h, w);
    starfield_update(&g_bg_starfield, w, h, dt);
    starfield_draw(&g_bg_starfield, g_renderer.main_win, w, h);
}

/* Draw text with a "zoom from center" reveal animation.
 * progress: 0.0 = nothing visible, 1.0 = fully revealed. */
static void draw_text_reveal(WINDOW *win, const char **lines, int num_lines,
                             int base_y, int win_w, float progress,
                             int color_pair)
{
    if (progress <= 0.0f) return;
    if (progress > 1.0f) progress = 1.0f;

    float t = 1.0f - (1.0f - progress) * (1.0f - progress) * (1.0f - progress);

    int max_w = 0;
    for (int i = 0; i < num_lines; i++) {
        int len = (int)strlen(lines[i]);
        if (len > max_w) max_w = len;
    }

    float half_w = (float)max_w / 2.0f;
    float half_h = (float)num_lines * 1.5f;
    float max_dist = sqrtf(half_w * half_w + half_h * half_h);
    float reveal = t * (max_dist + 3.0f);

    wattron(win, COLOR_PAIR(color_pair) | A_BOLD);

    for (int i = 0; i < num_lines; i++) {
        int len = (int)strlen(lines[i]);
        int lx = (win_w - len) / 2;
        if (lx < 0) lx = 0;
        int y = base_y + i;
        float dy = ((float)i - (float)(num_lines - 1) / 2.0f) * 3.0f;

        for (int j = 0; j < len; j++) {
            if (lines[i][j] == ' ') continue;
            float dx = (float)j - (float)(len - 1) / 2.0f;
            float dist = sqrtf(dx * dx + dy * dy);

            if (dist <= reveal) {
                mvwaddch(win, y, lx + j, lines[i][j]);
            }
        }
    }

    wattroff(win, COLOR_PAIR(color_pair) | A_BOLD);
}


void renderer_play_intro(void)
{
    WINDOW *win = g_renderer.main_win;
    int width, height;

    starfield_init(&g_bg_starfield, 150, 4.0f);
    g_bg_starfield_active = true;
    g_bg_sf_timer_init = false;

    const char *logo[] = {
        " ____   ___  _   _  ____        ____ _     ___ ",
        "|  _ \\ / _ \\| \\ | |/ ___|      / ___| |   |_ _|",
        "| |_) | | | |  \\| | |  _ _____| |   | |    | | ",
        "|  __/| |_| | |\\  | |_| |_____| |___| |___ | | ",
        "|_|    \\___/|_| \\_|\\____|      \\____|_____|___|"
    };
    const int logo_lines = 5;

    const char *logo_small[] = { "PONG-CLI" };
    const int logo_small_lines = 1;

    const char *subtitle[] = { "Terminal Edition" };
    const int subtitle_lines = 1;

    const char *press[] = { "Press any key to continue..." };
    const int press_lines = 1;

    const float LOGO_START  = 1.0f;
    const float LOGO_DUR    = 0.7f;
    const float SUB_START   = 2.0f;
    const float SUB_DUR     = 0.5f;
    const float PRESS_START = 3.0f;
    const float PRESS_DUR   = 0.4f;
    const float ACCEPT_KEY  = PRESS_START + PRESS_DUR;

    struct timespec t0, prev;
    clock_gettime(CLOCK_MONOTONIC, &t0);
    prev = t0;

    while (1) {
        struct timespec now;
        clock_gettime(CLOCK_MONOTONIC, &now);
        float elapsed = (float)(now.tv_sec - t0.tv_sec) +
                        (float)(now.tv_nsec - t0.tv_nsec) / 1e9f;
        float dt = (float)(now.tv_sec - prev.tv_sec) +
                   (float)(now.tv_nsec - prev.tv_nsec) / 1e9f;
        if (dt > 0.1f) dt = 0.1f;
        prev = now;

        getmaxyx(win, height, width);

        werase(win);
        starfield_update(&g_bg_starfield, width, height, dt);
        starfield_draw(&g_bg_starfield, win, width, height);

        const char **active_logo = logo;
        int active_logo_lines = logo_lines;
        if (width < 50) {
            active_logo = logo_small;
            active_logo_lines = logo_small_lines;
        }

        int logo_y = height / 4;
        int sub_y  = logo_y + active_logo_lines + 2;
        int press_y = height - 5;

        if (elapsed >= LOGO_START) {
            float p = (elapsed - LOGO_START) / LOGO_DUR;
            draw_text_reveal(win, active_logo, active_logo_lines,
                             logo_y, width, p, COLOR_TITLE);
        }

        if (elapsed >= SUB_START) {
            float p = (elapsed - SUB_START) / SUB_DUR;
            draw_text_reveal(win, subtitle, subtitle_lines,
                             sub_y, width, p, COLOR_SCORE);
        }

        if (elapsed >= PRESS_START) {
            float p = (elapsed - PRESS_START) / PRESS_DUR;
            draw_text_reveal(win, press, press_lines,
                             press_y, width, p, COLOR_MENU);
        }

        renderer_refresh();

        int ch = wgetch(win);
        if (ch != ERR) {
            if (elapsed >= ACCEPT_KEY) {
                break;
            } else if (ch == 27) {
                break;
            }
        }

        usleep(33000);
    }

    clock_gettime(CLOCK_MONOTONIC, &g_bg_sf_prev);
    g_bg_sf_timer_init = true;
}

/* Draw title screen */
void renderer_draw_title(void)
{
    renderer_clear();
    WINDOW *win = g_renderer.main_win;
    
    int height, width;
    getmaxyx(win, height, width);
    (void)width;
    
    int y = height / 4;
    
    wattron(win, COLOR_PAIR(COLOR_TITLE) | A_BOLD);
    draw_centered(win, y++, " ____   ___  _   _  ____        ____ _     ___ ", 0);
    draw_centered(win, y++, "|  _ \\ / _ \\| \\ | |/ ___|      / ___| |   |_ _|", 0);
    draw_centered(win, y++, "| |_) | | | |  \\| | |  _ _____| |   | |    | | ", 0);
    draw_centered(win, y++, "|  __/| |_| | |\\  | |_| |_____| |___| |___ | | ", 0);
    draw_centered(win, y++, "|_|    \\___/|_| \\_|\\____|      \\____|_____|___|", 0);
    wattroff(win, COLOR_PAIR(COLOR_TITLE) | A_BOLD);
    
    y += 2;
    draw_centered(win, y++, "Terminal Edition", COLOR_SCORE);
    
    y = height - 5;
    draw_centered(win, y, "Press any key to continue...", COLOR_MENU);
    
    renderer_refresh();
}

/* Draw login form */
void renderer_draw_login(const char *username, const char *password, 
                         int cursor_field, const char *error_msg)
{
    renderer_clear();
    draw_bg_starfield();
    WINDOW *win = g_renderer.main_win;
    
    int height, width;
    getmaxyx(win, height, width);
    
    int form_height = 12;
    int form_width = 50;
    int start_y = (height - form_height) / 2;
    int start_x = (width - form_width) / 2;
    
    WINDOW *form = derwin(win, form_height, form_width, start_y, start_x);
    werase(form);
    draw_border(form, "Login");
    
    int y = 2;
    
    if (cursor_field == 0) wattron(form, A_BOLD);
    mvwprintw(form, y, 3, "Username:");
    if (cursor_field == 0) wattroff(form, A_BOLD);
    
    mvwprintw(form, y + 1, 3, "[");
    mvwprintw(form, y + 1, form_width - 4, "]");
    mvwprintw(form, y + 1, 4, "%-*s", form_width - 8, username ? username : "");
    y += 3;
    
    if (cursor_field == 1) wattron(form, A_BOLD);
    mvwprintw(form, y, 3, "Password:");
    if (cursor_field == 1) wattroff(form, A_BOLD);
    
    mvwprintw(form, y + 1, 3, "[");
    mvwprintw(form, y + 1, form_width - 4, "]");
    
    int pwd_len = password ? (int)strlen(password) : 0;
    char pwd_display[128] = {0};
    for (int i = 0; i < pwd_len && i < (int)sizeof(pwd_display) - 1; i++) {
        pwd_display[i] = '*';
    }
    mvwprintw(form, y + 1, 4, "%-*s", form_width - 8, pwd_display);
    y += 3;
    
    if (error_msg && strlen(error_msg) > 0) {
        wattron(form, COLOR_PAIR(COLOR_ERROR));
        mvwprintw(form, y + 1, 3, "%.*s", form_width - 6, error_msg);
        wattroff(form, COLOR_PAIR(COLOR_ERROR));
    }
    
    mvwprintw(form, form_height - 2, 3, "TAB: Switch  ENTER: Submit  ESC: Quit");
    
    delwin(form);
    renderer_refresh();
}

/* Draw 2FA prompt */
void renderer_draw_2fa(const char *code, const char *error_msg)
{
    renderer_clear();
    draw_bg_starfield();
    WINDOW *win = g_renderer.main_win;
    
    int height, width;
    getmaxyx(win, height, width);
    
    int form_height = 10;
    int form_width = 40;
    int start_y = (height - form_height) / 2;
    int start_x = (width - form_width) / 2;
    
    WINDOW *form = derwin(win, form_height, form_width, start_y, start_x);
    werase(form);
    draw_border(form, "Two-Factor Authentication");
    
    int y = 2;
    mvwprintw(form, y++, 3, "Enter your 2FA code:");
    y++;
    
    int code_x = (form_width - 10) / 2;
    mvwprintw(form, y, code_x, "[");
    mvwprintw(form, y, code_x + 9, "]");
    mvwprintw(form, y, code_x + 1, "%-6s", code ? code : "");
    y += 2;
    
    if (error_msg && strlen(error_msg) > 0) {
        wattron(form, COLOR_PAIR(COLOR_ERROR));
        draw_centered(form, y, error_msg, 0);
        wattroff(form, COLOR_PAIR(COLOR_ERROR));
    }
    
    mvwprintw(form, form_height - 2, 3, "ENTER: Submit  ESC: Back");
    
    delwin(form);
    renderer_refresh();
}

void renderer_draw_menu(const char **options, int option_count, 
                        int selected, const char *title)
{
    renderer_clear();
    draw_bg_starfield();
    WINDOW *win = g_renderer.main_win;
    
    int height, width;
    getmaxyx(win, height, width);
    
    int menu_height = option_count + 6;
    int menu_width = 40;
    int start_y = (height - menu_height) / 2;
    int start_x = (width - menu_width) / 2;
    
    WINDOW *menu = derwin(win, menu_height, menu_width, start_y, start_x);
    werase(menu);
    draw_border(menu, title);
    
    int y = 2;
    for (int i = 0; i < option_count; i++) {
        if (i == selected) {
            wattron(menu, COLOR_PAIR(COLOR_SELECTED) | A_BOLD);
        }
        
        mvwprintw(menu, y + i, 3, "  %s  ", options[i]);
        
        if (i == selected) {
            wattroff(menu, COLOR_PAIR(COLOR_SELECTED) | A_BOLD);
        }
    }
    
    y = menu_height - 2;
    mvwprintw(menu, y, 3, "UP/DOWN: Navigate  ENTER: Select");
    
    delwin(menu);
    renderer_refresh();
}

/* Draw lobby screen */
void renderer_draw_lobby(lobby_t *lobby, int my_user_id)
{
    renderer_clear();
    draw_bg_starfield();
    WINDOW *win = g_renderer.main_win;
    
    int height, width;
    getmaxyx(win, height, width);
    
    int lobby_height = 17;
    int lobby_width = 60;
    int start_y = (height - lobby_height) / 2;
    int start_x = (width - lobby_width) / 2;
    
    WINDOW *lwin = derwin(win, lobby_height, lobby_width, start_y, start_x);
    werase(lwin);
    draw_border(lwin, "Game Lobby");
    
    int y = 2;
    
    mvwprintw(lwin, y++, 3, "Mode: %s", lobby->game_mode);
    mvwprintw(lwin, y++, 3, "Balls: %d  Max Score: %d", 
              lobby->ball_count, lobby->max_score);
    mvwprintw(lwin, y++, 3, "Powerups: %s", 
              lobby->allow_powerups ? "Enabled" : "Disabled");
    mvwprintw(lwin, y++, 3, "AI Players: %d", lobby->ai_count);
    y++;
    
    wattron(lwin, A_UNDERLINE);
    mvwprintw(lwin, y++, 3, "Players:");
    wattroff(lwin, A_UNDERLINE);
    
    for (int i = 0; i < lobby->player_count; i++) {
        player_t *p = &lobby->players[i];
        
        const char *ready_str = p->ready ? "[READY]" : "[-----]";
        const char *you_str = (p->id == my_user_id) ? " (You)" : "";
        
        if (p->ready) {
            wattron(lwin, COLOR_PAIR(COLOR_TITLE));
        }
        
        mvwprintw(lwin, y++, 5, "%s %s%s", ready_str, p->username, you_str);
        
        if (p->ready) {
            wattroff(lwin, COLOR_PAIR(COLOR_TITLE));
        }
    }
    
    y = lobby_height - 3;
    mvwprintw(lwin, y++, 3, "R: Toggle Ready  Q: Leave Lobby");
    mvwprintw(lwin, y, 3, "S: Start Game (when all ready)");
    
    delwin(lwin);
    renderer_refresh();
}

/* Draw waiting screen */
void renderer_draw_waiting(const char *message)
{
    renderer_clear();
    draw_bg_starfield();
    WINDOW *win = g_renderer.main_win;
    
    int height, width;
    getmaxyx(win, height, width);
    (void)width;
    
    int y = height / 2 - 2;
    
    wattron(win, A_BLINK);
    draw_centered(win, y, message, COLOR_SCORE);
    wattroff(win, A_BLINK);
    
    y += 3;
    draw_centered(win, y, "Press Q to cancel", COLOR_MENU);
    
    renderer_refresh();
}

/* Convert game coordinates to screen coordinates */
static void game_to_screen(float gx, float gy, int canvas_w, int canvas_h,
                           int screen_x, int screen_y, int screen_w, int screen_h,
                           int *sx, int *sy)
{
    *sx = screen_x + (int)((gx / (float)canvas_w) * (float)screen_w);
    *sy = screen_y + (int)((((float)canvas_h - gy) / (float)canvas_h) * (float)screen_h);
}

/* Bresenham line drawing on ncurses window */
static void draw_line(WINDOW *win, int x0, int y0, int x1, int y1,
                      int min_x, int min_y, int max_x, int max_y, chtype ch)
{
    int dx = abs(x1 - x0);
    int dy = abs(y1 - y0);
    int sx_step = (x0 < x1) ? 1 : -1;
    int sy_step = (y0 < y1) ? 1 : -1;
    int err = dx - dy;

    while (1) {
        if (x0 > min_x && x0 < max_x && y0 > min_y && y0 < max_y) {
            mvwaddch(win, y0, x0, ch);
        }
        if (x0 == x1 && y0 == y1) break;
        int e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx_step; }
        if (e2 < dx)  { err += dx; y0 += sy_step; }
    }
}

static int get_player_color(const game_state_t *game, int player_id)
{
    for (int i = 0; i < game->all_player_count; i++) {
        if (game->all_player_ids[i] == player_id)
            return COLOR_PLAYER_BASE + (i % MAX_PLAYER_COLORS);
    }
    for (int i = 0; i < game->player_count; i++) {
        if (game->players[i].id == player_id)
            return COLOR_PLAYER_BASE + (i % MAX_PLAYER_COLORS);
    }
    return COLOR_WALL;
}

/* Draw game state */
void renderer_draw_game(game_state_t *game)
{
    if (!game) return;
    
    renderer_clear();
    WINDOW *win = g_renderer.main_win;
    
    int height, width;
    getmaxyx(win, height, width);
    
    int status_h = 4;
    int game_h = height - status_h;
    int game_w = width - 2;
    int game_x = 1;
    int game_y = status_h;
    
    {
        bool is_los = (strcmp(game->game_mode, "lastOneStanding") == 0);
        int score_y = 0;
        int score_x = 2;

        if (is_los) {
            int alive = 0;
            for (int i = 0; i < game->player_count; i++) {
                bool has_paddle = false;
                for (int pi = 0; pi < game->paddle_count; pi++) {
                    if (game->paddles[pi].owner_id == game->players[i].id) {
                        has_paddle = true;
                        break;
                    }
                }
                if (has_paddle) alive++;
            }
            wattron(win, COLOR_PAIR(COLOR_SCORE) | A_BOLD);
            char hdr[40];
            snprintf(hdr, sizeof(hdr), "Alive: %d/%d", alive, game->player_count);
            mvwprintw(win, score_y, score_x, "%s", hdr);
            wattroff(win, COLOR_PAIR(COLOR_SCORE) | A_BOLD);
            score_x += (int)strlen(hdr) + 3;

            for (int i = 0; i < game->player_count; i++) {
                int pid = game->players[i].id;
                bool is_me = (pid == game->my_user_id);
                int cpair = get_player_color(game, pid);
                bool eliminated = true;
                for (int pi = 0; pi < game->paddle_count; pi++) {
                    if (game->paddles[pi].owner_id == pid) {
                        eliminated = false;
                        break;
                    }
                }

                char tag[80];
                if (is_me)
                    snprintf(tag, sizeof(tag), eliminated ? "[You]" : "You");
                else
                    snprintf(tag, sizeof(tag), eliminated ? "[P%d]" : "P%d", pid);

                wattron(win, COLOR_PAIR(cpair) | A_BOLD | (is_me ? A_UNDERLINE : 0)
                                               | (eliminated ? A_DIM : 0));
                int tag_len = (int)strlen(tag);
                if (score_x + tag_len + 1 >= width) {
                    score_y++;
                    score_x = 2;
                }
                mvwprintw(win, score_y, score_x, "%s", tag);
                wattroff(win, COLOR_PAIR(cpair) | A_BOLD | (is_me ? A_UNDERLINE : 0)
                                                | (eliminated ? A_DIM : 0));
                score_x += tag_len + 2;
            }
        } else {
            for (int i = 0; i < game->player_count; i++) {
                int pid = game->players[i].id;
                int sc  = game->players[i].score;
                bool is_me = (pid == game->my_user_id);
                int cpair = get_player_color(game, pid);

                wattron(win, COLOR_PAIR(cpair) | A_BOLD | (is_me ? A_UNDERLINE : 0));
                char tag[80];
                if (is_me)
                    snprintf(tag, sizeof(tag), "You:%d", sc);
                else
                    snprintf(tag, sizeof(tag), "P%d:%d", pid, sc);
                int tag_len = (int)strlen(tag);
                if (score_x + tag_len + 1 >= width) {
                    score_y++;
                    score_x = 2;
                }
                mvwprintw(win, score_y, score_x, "%s", tag);
                wattroff(win, COLOR_PAIR(cpair) | A_BOLD | (is_me ? A_UNDERLINE : 0));
                score_x += tag_len + 2;
            }
        }
    }
    
    {
        int effect_y = 2;
        
        int total_w = 0;
        for (int i = 0; i < game->active_effect_count; i++) {
            const char *label = powerup_type_label(game->active_effects[i].type);
            total_w += (int)strlen(label) + 3;
        }
        if (total_w > 0) total_w--;
        
        int effect_x = (width - total_w) / 2;
        if (effect_x < 1) effect_x = 1;
        
        for (int i = 0; i < game->active_effect_count; i++) {
            const active_effect_t *eff = &game->active_effects[i];
            const char *label = powerup_type_label(eff->type);
            int label_len = (int)strlen(label) + 2;
            
            if (effect_x + label_len >= width - 1) break;
            
            wattron(win, COLOR_PAIR(COLOR_POWERUP) | A_BOLD);
            mvwprintw(win, effect_y, effect_x, "[%s]", label);
            wattroff(win, COLOR_PAIR(COLOR_POWERUP) | A_BOLD);
            effect_x += label_len + 1;
        }
    }
    
    for (int x = game_x; x < game_x + game_w; x++) {
        mvwaddch(win, game_y, x, ACS_HLINE);
        mvwaddch(win, game_y + game_h - 1, x, ACS_HLINE);
    }
    for (int y = game_y; y < game_y + game_h; y++) {
        mvwaddch(win, y, game_x, ACS_VLINE);
        mvwaddch(win, y, game_x + game_w - 1, ACS_VLINE);
    }
    mvwaddch(win, game_y, game_x, ACS_ULCORNER);
    mvwaddch(win, game_y, game_x + game_w - 1, ACS_URCORNER);
    mvwaddch(win, game_y + game_h - 1, game_x, ACS_LLCORNER);
    mvwaddch(win, game_y + game_h - 1, game_x + game_w - 1, ACS_LRCORNER);
    
    pthread_mutex_lock(&game->mutex);

    int area_x = game_x + 1;
    int area_y = game_y + 1;
    int area_w = game_w - 2;
    int area_h = game_h - 2;

    {
        int mid_x = game_x + game_w / 2;
        wattron(win, COLOR_PAIR(COLOR_MIDLINE) | A_DIM);
        for (int cy = game_y + 1; cy < game_y + game_h - 1; cy++) {
            if (cy % 2 == 0)
                mvwaddch(win, cy, mid_x, ':');
        }
        wattroff(win, COLOR_PAIR(COLOR_MIDLINE) | A_DIM);
    }

    for (int i = 0; i < game->wall_count; i++) {
        const wall_t *w = &game->walls[i];
        
        int sx1, sy1, sx2, sy2;
        game_to_screen(w->x1, w->y1, game->canvas_width, game->canvas_height,
                       area_x, area_y, area_w, area_h, &sx1, &sy1);
        game_to_screen(w->x2, w->y2, game->canvas_width, game->canvas_height,
                       area_x, area_y, area_w, area_h, &sx2, &sy2);

        int wall_cpair = COLOR_WALL;
        if (w->player_id != -1
            && strcmp(game->game_mode, "lastOneStanding") == 0) {
            bool has_paddle = false;
            for (int pi = 0; pi < game->paddle_count; pi++) {
                if (game->paddles[pi].owner_id == w->player_id) {
                    has_paddle = true;
                    break;
                }
            }
            if (!has_paddle)
                wall_cpair = get_player_color(game, w->player_id);
        }
        wattron(win, COLOR_PAIR(wall_cpair) | A_BOLD);

        int wdx = sx2 - sx1;
        int wdy = sy2 - sy1;
        int ox, oy;
        if (abs(wdx) > abs(wdy)) {
            ox = 0; oy = 1;
        } else {
            ox = 1; oy = 0;
        }

        chtype wch = ACS_CKBOARD;
        draw_line(win, sx1, sy1, sx2, sy2,
                  game_x, game_y, game_x + game_w - 1, game_y + game_h - 1, wch);
        draw_line(win, sx1 + ox, sy1 + oy, sx2 + ox, sy2 + oy,
                  game_x, game_y, game_x + game_w - 1, game_y + game_h - 1, wch);
        draw_line(win, sx1 - ox, sy1 - oy, sx2 - ox, sy2 - oy,
                  game_x, game_y, game_x + game_w - 1, game_y + game_h - 1, wch);

        wattroff(win, COLOR_PAIR(wall_cpair) | A_BOLD);
    }
    
    for (int i = 0; i < game->paddle_count; i++) {
        const paddle_t *p = &game->paddles[i];
        
        float perp = p->angle + (float)M_PI / 2.0f;
        float half_len = p->width / 2.0f;
        float px1 = p->x - cosf(perp) * half_len;
        float py1 = p->y - sinf(perp) * half_len;
        float px2 = p->x + cosf(perp) * half_len;
        float py2 = p->y + sinf(perp) * half_len;

        int sx1, sy1, sx2, sy2;
        game_to_screen(px1, py1, game->canvas_width, game->canvas_height,
                       area_x, area_y, area_w, area_h, &sx1, &sy1);
        game_to_screen(px2, py2, game->canvas_width, game->canvas_height,
                       area_x, area_y, area_w, area_h, &sx2, &sy2);
        
        bool is_mine = (p->owner_id == game->my_user_id);
        int paddle_color = get_player_color(game, p->owner_id);
        wattron(win, COLOR_PAIR(paddle_color) | A_BOLD | (is_mine ? A_REVERSE : 0));
        
        draw_line(win, sx1, sy1, sx2, sy2,
                  game_x, game_y, game_x + game_w - 1, game_y + game_h - 1, '#');
        
        wattroff(win, COLOR_PAIR(paddle_color) | A_BOLD | (is_mine ? A_REVERSE : 0));
    }
    
    wattron(win, COLOR_PAIR(COLOR_POWERUP) | A_BOLD | A_BLINK);
    for (int i = 0; i < game->powerup_count; i++) {
        const powerup_t *p = &game->powerups[i];
        if (!p->active || p->activation_tick >= 0) continue;
        
        int sx, sy;
        game_to_screen(p->x, p->y, game->canvas_width, game->canvas_height,
                       area_x, area_y, area_w, area_h, &sx, &sy);
        
        if (sx > game_x && sx < game_x + game_w - 1 &&
            sy > game_y && sy < game_y + game_h - 1) {
            mvwaddch(win, sy, sx, powerup_field_char(p->type));
        }
    }
    wattroff(win, COLOR_PAIR(COLOR_POWERUP) | A_BOLD | A_BLINK);

    wattron(win, COLOR_PAIR(COLOR_BALL) | A_BOLD);

    for (int i = 0; i < game->ball_count; i++) {
        const ball_t *b = &game->balls[i];
        if (!b->active) continue;
        
        int sx, sy;
        game_to_screen(b->x, b->y, game->canvas_width, game->canvas_height,
                       area_x, area_y, area_w, area_h, &sx, &sy);
        

        if (b->radius > 25.0f) {
            if (sx > game_x + 1 && sx < game_x + game_w - 2 &&
                sy > game_y + 1 && sy < game_y + game_h - 2) {
                mvwaddch(win, sy, sx, '@');
                mvwaddch(win, sy - 1, sx, 'O');
                mvwaddch(win, sy + 1, sx, 'O');
                mvwaddch(win, sy, sx - 1, 'O');
                mvwaddch(win, sy, sx + 1, 'O');
            }
        } else if (b->radius > 11.0f) {
            if (sx > game_x + 1 && sx < game_x + game_w - 2 &&
                sy > game_y && sy < game_y + game_h - 1) {
                mvwaddch(win, sy, sx, '@');
                mvwaddch(win, sy, sx - 1, '(');
                mvwaddch(win, sy, sx + 1, ')');
            }
        } else if (b->radius < 6.0f) {
            if (sx > game_x && sx < game_x + game_w - 1 &&
                sy > game_y && sy < game_y + game_h - 1) {
                mvwaddch(win, sy, sx, '.');
            }
        } else if (b->radius < 9.0f) {
            if (sx > game_x && sx < game_x + game_w - 1 &&
                sy > game_y && sy < game_y + game_h - 1) {
                mvwaddch(win, sy, sx, 'o');
            }
        } else {
            if (sx > game_x && sx < game_x + game_w - 1 &&
                sy > game_y && sy < game_y + game_h - 1) {
                mvwaddch(win, sy, sx, 'O');
            }
        }
    }
    wattroff(win, COLOR_PAIR(COLOR_BALL) | A_BOLD);
    
    pthread_mutex_unlock(&game->mutex);
    
    mvwprintw(win, height - 1, 3, "A/LEFT: Left  D/RIGHT: Right  Q: Quit");
    
    renderer_refresh();
}

/* Draw game over screen */
void renderer_draw_game_over(game_state_t *game)
{
    if (!game) return;
    
    renderer_clear();
    WINDOW *win = g_renderer.main_win;
    
    int height, width;
    getmaxyx(win, height, width);
    (void)width;
    
    int y = height / 4;
    
    bool i_won = (game->winner_id == game->my_user_id);
    
    if (i_won) {
        wattron(win, COLOR_PAIR(COLOR_TITLE) | A_BOLD);
        draw_centered(win, y++, "*** VICTORY! ***", 0);
        wattroff(win, COLOR_PAIR(COLOR_TITLE) | A_BOLD);
    } else {
        wattron(win, COLOR_PAIR(COLOR_ERROR) | A_BOLD);
        draw_centered(win, y++, "*** DEFEAT ***", 0);
        wattroff(win, COLOR_PAIR(COLOR_ERROR) | A_BOLD);
    }
    
    y += 2;
    
    draw_centered(win, y++, "Final Scores:", COLOR_SCORE);
    y++;
    
    int order[MAX_PLAYERS];
    for (int i = 0; i < game->player_count; i++) order[i] = i;
    for (int i = 1; i < game->player_count; i++) {
        int key = order[i];
        int j = i - 1;
        while (j >= 0) {
            int sa = game->players[order[j]].score;
            int sb = game->players[key].score;
            bool swap = (sa < sb) ||
                        (sa == sb && game->players[key].id == game->winner_id);
            if (!swap) break;
            order[j + 1] = order[j];
            j--;
        }
        order[j + 1] = key;
    }
    for (int rank = 0; rank < game->player_count && y < height - 4; rank++) {
        int idx = order[rank];
        int pid = game->players[idx].id;
        int sc  = game->players[idx].score;
        bool is_me = (pid == game->my_user_id);
        int cpair = get_player_color(game, pid);
        
        char line[80];
        if (is_me)
            snprintf(line, sizeof(line), "%d. You: %d", rank + 1, sc);
        else
            snprintf(line, sizeof(line), "%d. Player %d: %d", rank + 1, pid, sc);
        
        wattron(win, COLOR_PAIR(cpair) | (is_me ? A_BOLD : 0));
        draw_centered(win, y++, line, 0);
        wattroff(win, COLOR_PAIR(cpair) | (is_me ? A_BOLD : 0));
    }
    
    y += 2;
    draw_centered(win, y++, "Press any key to continue...", COLOR_MENU);
    
    renderer_refresh();
}

/* Draw error message */
void renderer_draw_error(const char *title, const char *message)
{
    renderer_clear();
    WINDOW *win = g_renderer.main_win;
    
    int height, width;
    getmaxyx(win, height, width);
    
    int box_height = 8;
    int box_width = 50;
    int start_y = (height - box_height) / 2;
    int start_x = (width - box_width) / 2;
    
    WINDOW *err = derwin(win, box_height, box_width, start_y, start_x);
    
    wattron(err, COLOR_PAIR(COLOR_ERROR));
    draw_border(err, title ? title : "Error");
    wattroff(err, COLOR_PAIR(COLOR_ERROR));
    
    if (message) {
        int msg_len = (int)strlen(message);
        int msg_x = 3;
        
        if (msg_len > box_width - 6) {
            int y = 2;
            int remaining = msg_len;
            const char *ptr = message;
            
            while (remaining > 0 && y < box_height - 2) {
                int chunk = (remaining > box_width - 6) ? (box_width - 6) : remaining;
                mvwprintw(err, y++, msg_x, "%.*s", chunk, ptr);
                ptr += chunk;
                remaining -= chunk;
            }
        } else {
            draw_centered(err, 3, message, 0);
        }
    }
    
    mvwprintw(err, box_height - 2, 3, "Press any key to continue...");
    
    delwin(err);
    renderer_refresh();
}

/* Draw loading indicator */
void renderer_draw_loading(const char *message)
{
    renderer_clear();
    WINDOW *win = g_renderer.main_win;
    
    int height, width;
    getmaxyx(win, height, width);
    (void)width;
    
    int y = height / 2;
    
    static int frame = 0;
    const char *spinner = "|/-\\";
    char spin_char = spinner[frame % 4];
    frame++;
    
    char display[256];
    snprintf(display, sizeof(display), "%c %s %c", spin_char, message ? message : "Loading...", spin_char);
    
    draw_centered(win, y, display, COLOR_SCORE);
    
    renderer_refresh();
}

/* Draw matchmaking screen */
void renderer_draw_matchmaking(const char *mode, int elapsed_seconds)
{
    renderer_clear();
    draw_bg_starfield();
    WINDOW *win = g_renderer.main_win;
    
    int height, width;
    getmaxyx(win, height, width);
    (void)width;
    
    int y = height / 3;
    
    wattron(win, COLOR_PAIR(COLOR_TITLE) | A_BOLD);
    draw_centered(win, y++, "Searching for Match...", 0);
    wattroff(win, COLOR_PAIR(COLOR_TITLE) | A_BOLD);
    
    y += 2;
    
    char mode_line[64];
    snprintf(mode_line, sizeof(mode_line), "Mode: %s", mode);
    draw_centered(win, y++, mode_line, COLOR_SCORE);
    
    y++;
    
    char time_line[64];
    int mins = elapsed_seconds / 60;
    int secs = elapsed_seconds % 60;
    snprintf(time_line, sizeof(time_line), "Time: %02d:%02d", mins, secs);
    draw_centered(win, y++, time_line, COLOR_MENU);
    
    static int dots = 0;
    dots = (dots + 1) % 4;
    
    char dots_str[8];
    memset(dots_str, '.', dots);
    dots_str[dots] = '\0';
    
    y += 2;
    draw_centered(win, y, dots_str, COLOR_MENU);
    
    y = height - 5;
    draw_centered(win, y, "Press Q to cancel", COLOR_MENU);
    
    renderer_refresh();
}

/* Draw settings menu */
void renderer_draw_settings(const char **settings, const char **values, 
                            int setting_count, int selected)
{
    renderer_clear();
    draw_bg_starfield();
    WINDOW *win = g_renderer.main_win;
    
    int height, width;
    getmaxyx(win, height, width);
    
    int menu_height = setting_count + 8;
    int menu_width = 50;
    int start_y = (height - menu_height) / 2;
    int start_x = (width - menu_width) / 2;
    
    WINDOW *swin = derwin(win, menu_height, menu_width, start_y, start_x);
    werase(swin);
    draw_border(swin, "Settings");
    
    int y = 2;
    for (int i = 0; i < setting_count; i++) {
        if (i == selected) {
            wattron(swin, COLOR_PAIR(COLOR_SELECTED) | A_BOLD);
        }
        
        mvwprintw(swin, y, 3, "%-20s: %s", settings[i], values[i]);
        y++;
        
        if (i == selected) {
            wattroff(swin, COLOR_PAIR(COLOR_SELECTED) | A_BOLD);
        }
    }
    
    y = menu_height - 3;
    mvwprintw(swin, y++, 3, "UP/DOWN: Navigate  LEFT/RIGHT: Change");
    mvwprintw(swin, y, 3, "ENTER: Save  ESC: Cancel");
    
    delwin(swin);
    renderer_refresh();
}

void renderer_draw_invite(online_user_t *users, int user_count,
                          int selected, int my_user_id,
                          const char *search_query, bool searching)
{
    (void)my_user_id;
    renderer_clear();
    draw_bg_starfield();
    WINDOW *win = g_renderer.main_win;
    
    int height, width;
    getmaxyx(win, height, width);
    
    int menu_height = (user_count > 0 ? user_count : 1) + 10;
    if (menu_height > height - 2) menu_height = height - 2;
    int menu_width = 52;
    if (menu_width > width - 2) menu_width = width - 2;
    int start_y = (height - menu_height) / 2;
    int start_x = (width - menu_width) / 2;
    
    WINDOW *swin = derwin(win, menu_height, menu_width, start_y, start_x);
    werase(swin);
    draw_border(swin, "Invite Players");
    
    int y = 2;
    
    if (user_count == 0) {
        wattron(swin, A_DIM);
        mvwprintw(swin, y++, 3, "No online users found.");
        mvwprintw(swin, y++, 3, "Press / to search by username.");
        wattroff(swin, A_DIM);
    } else {
        int visible_rows = menu_height - 8;
        if (visible_rows < 1) visible_rows = 1;
        int scroll_offset = 0;
        if (selected >= visible_rows)
            scroll_offset = selected - visible_rows + 1;
        if (scroll_offset > user_count - visible_rows)
            scroll_offset = user_count - visible_rows;
        if (scroll_offset < 0) scroll_offset = 0;
        
        for (int i = scroll_offset;
             i < user_count && (i - scroll_offset) < visible_rows; i++) {
            bool is_selected = (i == selected);
            bool is_checked  = users[i].selected;
            
            if (is_selected)
                wattron(swin, COLOR_PAIR(COLOR_SELECTED) | A_BOLD);
            
            const char *name = users[i].username[0]
                ? users[i].username
                : "(loading...)";
            
            mvwprintw(swin, y, 3, "[%c] %-30s  (ID %d)",
                      is_checked ? 'X' : ' ',
                      name,
                      users[i].id);
            y++;
            
            if (is_selected)
                wattroff(swin, COLOR_PAIR(COLOR_SELECTED) | A_BOLD);
        }
    }
    
    y = menu_height - 5;
    if (searching) {
        wattron(swin, COLOR_PAIR(COLOR_TITLE));
        mvwprintw(swin, y, 3, "Search: %s_", search_query);
        wattroff(swin, COLOR_PAIR(COLOR_TITLE));
    } else if (search_query && search_query[0]) {
        mvwprintw(swin, y, 3, "Search: %s", search_query);
    }
    
    y = menu_height - 3;
    mvwprintw(swin, y++, 3, "UP/DOWN: Move  SPACE: Select  /: Search");
    mvwprintw(swin, y,   3, "ENTER: Create Lobby  R: Refresh  ESC: Back");
    
    delwin(swin);
    renderer_refresh();
}

/* Draw incoming invitation screen */
void renderer_draw_invitation(lobby_t *lobby, int my_user_id)
{
    renderer_clear();
    draw_bg_starfield();
    WINDOW *win = g_renderer.main_win;

    int height, width;
    getmaxyx(win, height, width);

    int box_h = 14 + lobby->player_count;
    if (box_h > height - 2) box_h = height - 2;
    int box_w = 54;
    if (box_w > width - 2) box_w = width - 2;
    int start_y = (height - box_h) / 2;
    int start_x = (width - box_w) / 2;

    WINDOW *iwin = derwin(win, box_h, box_w, start_y, start_x);
    werase(iwin);
    draw_border(iwin, "Game Invitation");

    int y = 2;

    const char *host_name = "Unknown";
    for (int i = 0; i < lobby->player_count; i++) {
        if (lobby->players[i].is_host) {
            host_name = lobby->players[i].username;
            break;
        }
    }

    wattron(iwin, COLOR_PAIR(COLOR_TITLE) | A_BOLD);
    mvwprintw(iwin, y++, 3, "You've been invited to play!");
    wattroff(iwin, COLOR_PAIR(COLOR_TITLE) | A_BOLD);
    y++;

    mvwprintw(iwin, y++, 3, "Host: %s", host_name);
    mvwprintw(iwin, y++, 3, "Mode: %s", lobby->game_mode);
    mvwprintw(iwin, y++, 3, "Balls: %d  Max Score: %d",
              lobby->ball_count, lobby->max_score);
    mvwprintw(iwin, y++, 3, "Powerups: %s  AI: %d",
              lobby->allow_powerups ? "On" : "Off", lobby->ai_count);
    y++;

    mvwprintw(iwin, y++, 3, "Players:");
    for (int i = 0; i < lobby->player_count; i++) {
        const char *tag = "";
        if (lobby->players[i].is_host) tag = " (Host)";
        else if (lobby->players[i].id == my_user_id) tag = " (You)";
        mvwprintw(iwin, y++, 5, "- %s%s", lobby->players[i].username, tag);
    }

    y = box_h - 3;
    wattron(iwin, COLOR_PAIR(COLOR_TITLE));
    mvwprintw(iwin, y++, 3, "A: Accept   D: Decline");
    wattroff(iwin, COLOR_PAIR(COLOR_TITLE));

    delwin(iwin);
    renderer_refresh();
}
