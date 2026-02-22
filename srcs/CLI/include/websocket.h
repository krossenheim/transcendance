/**
 * @file websocket.h
 * @brief WebSocket client for Pong CLI
 * 
 * Handles WebSocket communication with the game hub server,
 * including message serialization/deserialization and subscriptions.
 */

#ifndef WEBSOCKET_H
#define WEBSOCKET_H

#include <stdbool.h>
#include <pthread.h>
#include <libwebsockets.h>

/* Message buffer sizes */
#define WS_MAX_MSG_SIZE         65536
#define WS_SEND_BUFFER_SIZE     4096
#define WS_RECV_BUFFER_SIZE     65536

/* Connection states */
typedef enum {
    WS_STATE_DISCONNECTED,
    WS_STATE_CONNECTING,
    WS_STATE_AUTHENTICATING,
    WS_STATE_CONNECTED,
    WS_STATE_ERROR,
} ws_state_t;

/* Message callback function type */
typedef void (*ws_message_callback_t)(const char *func_id, int code, 
                                       const char *payload, void *user_data);

/* Subscription entry */
typedef struct ws_subscription {
    char                    *func_id;
    ws_message_callback_t   callback;
    void                    *user_data;
    struct ws_subscription  *next;
} ws_subscription_t;

/* Message queue entry */
typedef struct ws_message {
    char                *data;
    size_t              len;
    struct ws_message   *next;
} ws_message_t;

/* WebSocket context */
typedef struct pong_websocket {
    /* libwebsockets context */
    struct lws_context      *context;
    struct lws              *wsi;
    
    /* Connection settings */
    char                    *host;
    int                     port;
    char                    *path;
    bool                    use_ssl;
    char                    *auth_token;
    
    /* State */
    ws_state_t              state;
    bool                    should_reconnect;
    int                     reconnect_attempts;
    int                     max_reconnect_attempts;
    
    /* Threading */
    pthread_t               service_thread;
    pthread_mutex_t         mutex;
    pthread_cond_t          cond;
    bool                    thread_running;
    bool                    shutting_down;
    
    /* Message handling */
    ws_subscription_t       *subscriptions;
    ws_message_t            *send_queue;
    ws_message_t            *send_queue_tail;
    
    /* Receive buffer */
    char                    recv_buffer[WS_RECV_BUFFER_SIZE];
    size_t                  recv_len;
    
    /* Callbacks for connection events */
    void                    (*on_connected)(void *user_data);
    void                    (*on_disconnected)(void *user_data);
    void                    (*on_error)(const char *error, void *user_data);
    void                    *callback_user_data;
} pong_websocket_t;

/* WebSocket lifecycle */
pong_websocket_t    *ws_create(const char *host, int port, const char *path);
void                ws_destroy(pong_websocket_t *ws);

/* Auth token */
void                ws_set_auth_token(pong_websocket_t *ws, const char *token);

/* Connection management */
int                 ws_connect(pong_websocket_t *ws);
void                ws_disconnect(pong_websocket_t *ws);
bool                ws_is_connected(pong_websocket_t *ws);
ws_state_t          ws_get_state(pong_websocket_t *ws);

/* Message sending */
int                 ws_send_message(pong_websocket_t *ws, const char *container,
                                    const char *func_id, const char *payload);
int                 ws_send_raw(pong_websocket_t *ws, const char *data, size_t len);

/* Message subscription */
int                 ws_subscribe(pong_websocket_t *ws, const char *func_id,
                                 ws_message_callback_t callback, void *user_data);
void                ws_unsubscribe(pong_websocket_t *ws, const char *func_id);
void                ws_unsubscribe_all(pong_websocket_t *ws);

/* Event callbacks */
void                ws_set_callbacks(pong_websocket_t *ws,
                                     void (*on_connected)(void *),
                                     void (*on_disconnected)(void *),
                                     void (*on_error)(const char *, void *),
                                     void *user_data);

/* Service loop */
int                 ws_service(pong_websocket_t *ws, int timeout_ms);

/* Threading */
int                 ws_start_service_thread(pong_websocket_t *ws);
void                ws_stop_service_thread(pong_websocket_t *ws);

/* Protocol helpers */
char                *ws_format_client_message(const char *container, 
                                               const char *func_id, 
                                               const char *payload);
int                 ws_parse_hub_message(const char *message,
                                          char *container, size_t cont_len,
                                          char *func_id, size_t func_len,
                                          int *code,
                                          char *payload, size_t payload_len);

#endif /* WEBSOCKET_H */
