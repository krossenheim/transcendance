/**
 * @file auth.h
 * @brief Authentication module for Pong CLI
 * 
 * Handles user authentication via HTTP API, token management,
 * session persistence, and 2FA verification.
 */

#ifndef AUTH_H
#define AUTH_H

#include <stdbool.h>
#include <time.h>

/* Authentication session */
typedef struct auth_session {
    int             user_id;
    char            username[128];
    char            email[256];
    char            access_token[2048];
    char            refresh_token[2048];
    time_t          token_expires;
    bool            authenticated;
    bool            needs_2fa;
    bool            is_guest;
    bool            has_2fa_enabled;
    char            temp_2fa_token[512];
    char            session_path[512];
    char            host[256];
    int             port;
} auth_session_t;

/* Session management - returns new session, caller must free with auth_destroy_session */
auth_session_t  *auth_login(const char *host, int port, 
                             const char *username, const char *password);
auth_session_t  *auth_register(const char *host, int port,
                                const char *username, const char *email, 
                                const char *password);
auth_session_t  *auth_create_guest(const char *host, int port);

/* Session lifecycle */
auth_session_t  *auth_load_session(void);  /* Returns NULL if no saved session */
int             auth_save_session(auth_session_t *session);
void            auth_destroy_session(auth_session_t *session);
bool            auth_validate_session(auth_session_t *session);

/* Authentication operations */
int             auth_verify_2fa(auth_session_t *session, const char *code);
int             auth_refresh_token(auth_session_t *session);
int             auth_logout(auth_session_t *session);

/* State queries */
bool            auth_is_authenticated(auth_session_t *session);
const char      *auth_get_access_token(auth_session_t *session);
int             auth_get_user_id(auth_session_t *session);
const char      *auth_get_username(auth_session_t *session);

#endif /* AUTH_H */
