/**
 * @file websocket.c
 * @brief WebSocket client for Pong CLI using libwebsockets
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include "websocket.h"
#include "utils.h"

/* Protocol callback */
static int callback_pong(struct lws *wsi, enum lws_callback_reasons reason,
                         void *user, void *in, size_t len)
{
    pong_websocket_t *ws = (pong_websocket_t *)lws_context_user(lws_get_context(wsi));
    (void)user;  /* Unused */
    
    /* Debug logging to file */
    static FILE *ws_log = NULL;
    if (!ws_log) ws_log = fopen("/tmp/pong_cli_ws.log", "w");
    if (ws_log) {
        fprintf(ws_log, "callback reason=%d\\n", reason);
        fflush(ws_log);
    }
    
    switch (reason) {
        case LWS_CALLBACK_CLIENT_ESTABLISHED:
            if (ws->shutting_down) return -1;
            if (ws_log) { fprintf(ws_log, "ESTABLISHED\\n"); fflush(ws_log); }
            pthread_mutex_lock(&ws->mutex);
            ws->state = WS_STATE_CONNECTED;
            pthread_cond_signal(&ws->cond);
            pthread_mutex_unlock(&ws->mutex);
            
            if (ws->on_connected) {
                ws->on_connected(ws->callback_user_data);
            }
            break;
            
        case LWS_CALLBACK_CLIENT_CONNECTION_ERROR:
            if (ws_log) { fprintf(ws_log, "CONNECTION_ERROR: %s\\n", in ? (const char*)in : "unknown"); fflush(ws_log); }
            pthread_mutex_lock(&ws->mutex);
            ws->state = WS_STATE_ERROR;
            pthread_cond_signal(&ws->cond);
            pthread_mutex_unlock(&ws->mutex);
            
            if (ws->on_error) {
                ws->on_error(in ? (const char *)in : "Connection error", 
                            ws->callback_user_data);
            }
            break;
            
        case LWS_CALLBACK_CLIENT_CLOSED:
            pthread_mutex_lock(&ws->mutex);
            ws->state = WS_STATE_DISCONNECTED;
            ws->wsi = NULL;
            pthread_mutex_unlock(&ws->mutex);
            
            if (ws->on_disconnected) {
                ws->on_disconnected(ws->callback_user_data);
            }
            break;
            
        case LWS_CALLBACK_CLIENT_RECEIVE:
            if (ws->shutting_down) return -1;
            if (in && len > 0) {
                /* Append to receive buffer */
                pthread_mutex_lock(&ws->mutex);
                if (ws->recv_len + len < WS_RECV_BUFFER_SIZE - 1) {
                    memcpy(ws->recv_buffer + ws->recv_len, in, len);
                    ws->recv_len += len;
                    ws->recv_buffer[ws->recv_len] = '\0';
                }
                
                /* Log received data */
                if (ws_log) { 
                    fprintf(ws_log, "RECEIVE: %.*s\\n", (int)len, (char*)in); 
                    fflush(ws_log); 
                }
                
                /* Check if we have complete message */
                if (lws_is_final_fragment(wsi)) {
                    /* Parse and dispatch message */
                    char container[64] = {0};
                    char func_id[64] = {0};
                    int code = 0;
                    char payload[WS_RECV_BUFFER_SIZE] = {0};
                    
                    if (ws_log) {
                        fprintf(ws_log, "FULL MESSAGE: %s\\n", ws->recv_buffer);
                        fflush(ws_log);
                    }
                    
                    if (ws_parse_hub_message(ws->recv_buffer, 
                                             container, sizeof(container),
                                             func_id, sizeof(func_id),
                                             &code,
                                             payload, sizeof(payload)) == 0) {
                        if (ws_log) {
                            fprintf(ws_log, "PARSED: container=%s func_id=%s code=%d\\n", container, func_id, code);
                            fflush(ws_log);
                        }
                        /* Find matching subscription */
                        ws_subscription_t *sub = ws->subscriptions;
                        while (sub) {
                            if (strcmp(sub->func_id, func_id) == 0) {
                                if (ws_log) { fprintf(ws_log, "FOUND SUB for %s\\n", func_id); fflush(ws_log); }
                                pthread_mutex_unlock(&ws->mutex);
                                sub->callback(func_id, code, payload, sub->user_data);
                                pthread_mutex_lock(&ws->mutex);
                                break;
                            }
                            sub = sub->next;
                        }
                        if (!sub && ws_log) { fprintf(ws_log, "NO SUB for %s\\n", func_id); fflush(ws_log); }
                    } else {
                        if (ws_log) { fprintf(ws_log, "PARSE FAILED\\n"); fflush(ws_log); }
                    }
                    
                    ws->recv_len = 0;
                    ws->recv_buffer[0] = '\0';
                }
                pthread_mutex_unlock(&ws->mutex);
            }
            break;
            
        case LWS_CALLBACK_CLIENT_WRITEABLE:
            if (ws->shutting_down) return -1;
            pthread_mutex_lock(&ws->mutex);
            if (ws->send_queue) {
                ws_message_t *msg = ws->send_queue;
                ws->send_queue = msg->next;
                if (!ws->send_queue) {
                    ws->send_queue_tail = NULL;
                }
                pthread_mutex_unlock(&ws->mutex);
                
                /* Send with LWS_PRE padding */
                unsigned char *buf = malloc(LWS_PRE + msg->len);
                if (buf) {
                    memcpy(buf + LWS_PRE, msg->data, msg->len);
                    lws_write(wsi, buf + LWS_PRE, msg->len, LWS_WRITE_TEXT);
                    free(buf);
                }
                
                free(msg->data);
                free(msg);
                
                pthread_mutex_lock(&ws->mutex);
                if (ws->send_queue) {
                    lws_callback_on_writable(wsi);
                }
            }
            pthread_mutex_unlock(&ws->mutex);
            break;
            
        default:
            break;
    }
    
    return 0;
}

/* Protocol list */
static struct lws_protocols protocols[] = {
    {
        .name = "pong-protocol",
        .callback = callback_pong,
        .per_session_data_size = 0,
        .rx_buffer_size = WS_RECV_BUFFER_SIZE,
        .id = 0,
        .user = NULL,
        .tx_packet_size = 0,
    },
    { .name = NULL, .callback = NULL, .per_session_data_size = 0, .rx_buffer_size = 0, .id = 0, .user = NULL, .tx_packet_size = 0 }
};

/* Create WebSocket client */
pong_websocket_t *ws_create(const char *host, int port, const char *path)
{
    pong_websocket_t *ws = calloc(1, sizeof(pong_websocket_t));
    if (!ws) return NULL;
    
    ws->host = strdup(host);
    ws->port = port;
    ws->path = strdup(path ? path : "/ws");
    ws->use_ssl = true;  /* Default to SSL */
    ws->state = WS_STATE_DISCONNECTED;
    ws->max_reconnect_attempts = 5;
    
    pthread_mutex_init(&ws->mutex, NULL);
    pthread_cond_init(&ws->cond, NULL);
    
    return ws;
}

/* Destroy WebSocket client */
void ws_destroy(pong_websocket_t *ws)
{
    if (!ws) return;
    
    ws_disconnect(ws);
    ws_unsubscribe_all(ws);
    
    /* Free send queue */
    while (ws->send_queue) {
        ws_message_t *msg = ws->send_queue;
        ws->send_queue = msg->next;
        free(msg->data);
        free(msg);
    }
    
    pthread_mutex_destroy(&ws->mutex);
    pthread_cond_destroy(&ws->cond);
    
    free(ws->host);
    free(ws->path);
    free(ws->auth_token);
    free(ws);
}

/* Set auth token */
void ws_set_auth_token(pong_websocket_t *ws, const char *token)
{
    if (!ws) return;
    
    pthread_mutex_lock(&ws->mutex);
    free(ws->auth_token);
    ws->auth_token = token ? strdup(token) : NULL;
    pthread_mutex_unlock(&ws->mutex);
}

/* Connect to server */
int ws_connect(pong_websocket_t *ws)
{
    if (!ws) return -1;
    
    pthread_mutex_lock(&ws->mutex);
    if (ws->state == WS_STATE_CONNECTED || ws->state == WS_STATE_CONNECTING) {
        pthread_mutex_unlock(&ws->mutex);
        return 0;
    }
    
    ws->state = WS_STATE_CONNECTING;
    pthread_mutex_unlock(&ws->mutex);
    
    /* Suppress libwebsockets debug logging - it interferes with ncurses */
    lws_set_log_level(0, NULL);
    
    /* Create context */
    struct lws_context_creation_info ctx_info;
    memset(&ctx_info, 0, sizeof(ctx_info));
    
    ctx_info.port = CONTEXT_PORT_NO_LISTEN;
    ctx_info.protocols = protocols;
    ctx_info.options = LWS_SERVER_OPTION_DO_SSL_GLOBAL_INIT;
    ctx_info.user = ws;
    
    ws->context = lws_create_context(&ctx_info);
    if (!ws->context) {
        ws->state = WS_STATE_ERROR;
        return -1;
    }
    
    /* Connect */
    struct lws_client_connect_info conn_info;
    memset(&conn_info, 0, sizeof(conn_info));
    
    conn_info.context = ws->context;
    conn_info.address = ws->host;
    conn_info.port = ws->port;
    conn_info.path = ws->path;
    conn_info.host = ws->host;
    conn_info.origin = ws->host;
    conn_info.protocol = protocols[0].name;
    conn_info.ssl_connection = ws->use_ssl ? 
        (LCCSCF_USE_SSL | LCCSCF_ALLOW_SELFSIGNED | LCCSCF_SKIP_SERVER_CERT_HOSTNAME_CHECK) : 0;
    
    ws->wsi = lws_client_connect_via_info(&conn_info);
    if (!ws->wsi) {
        lws_context_destroy(ws->context);
        ws->context = NULL;
        ws->state = WS_STATE_ERROR;
        return -1;
    }
    
    /* Wait for connection to be established (run service loop until connected or error) */
    int timeout_ms = 10000;  /* 10 second timeout */
    int elapsed = 0;
    while (elapsed < timeout_ms) {
        lws_service(ws->context, 50);
        
        pthread_mutex_lock(&ws->mutex);
        ws_state_t state = ws->state;
        pthread_mutex_unlock(&ws->mutex);
        
        if (state == WS_STATE_CONNECTED) {
            return 0;
        }
        if (state == WS_STATE_ERROR || state == WS_STATE_DISCONNECTED) {
            lws_context_destroy(ws->context);
            ws->context = NULL;
            ws->wsi = NULL;
            return -1;
        }
        elapsed += 50;
    }
    
    /* Timeout */
    ws->state = WS_STATE_ERROR;
    lws_context_destroy(ws->context);
    ws->context = NULL;
    ws->wsi = NULL;
    return -1;
}

/* Disconnect */
void ws_disconnect(pong_websocket_t *ws)
{
    if (!ws) return;
    
    pthread_mutex_lock(&ws->mutex);
    
    /* Tell the lws callback to return -1 (force-close) so
     * lws_context_destroy doesn't block on a TLS shutdown
     * round-trip with the server. */
    ws->shutting_down = true;
    
    if (ws->context) {
        lws_cancel_service(ws->context);
    }
    
    pthread_mutex_unlock(&ws->mutex);
    
    /* Give the service loop one iteration to process the close. */
    usleep(100000);  /* 100 ms */
    
    pthread_mutex_lock(&ws->mutex);
    
    ws->wsi = NULL;
    
    if (ws->context) {
        pthread_mutex_unlock(&ws->mutex);
        lws_context_destroy(ws->context);
        pthread_mutex_lock(&ws->mutex);
        ws->context = NULL;
    }
    
    ws->state = WS_STATE_DISCONNECTED;
    ws->shutting_down = false;
    pthread_mutex_unlock(&ws->mutex);
}

/* Check if connected */
bool ws_is_connected(pong_websocket_t *ws)
{
    if (!ws) return false;
    pthread_mutex_lock(&ws->mutex);
    bool connected = (ws->state == WS_STATE_CONNECTED);
    pthread_mutex_unlock(&ws->mutex);
    return connected;
}

/* Get state */
ws_state_t ws_get_state(pong_websocket_t *ws)
{
    if (!ws) return WS_STATE_DISCONNECTED;
    pthread_mutex_lock(&ws->mutex);
    ws_state_t state = ws->state;
    pthread_mutex_unlock(&ws->mutex);
    return state;
}

/* Queue message for sending */
static int queue_message(pong_websocket_t *ws, const char *data, size_t len)
{
    ws_message_t *msg = calloc(1, sizeof(ws_message_t));
    if (!msg) return -1;
    
    msg->data = malloc(len + 1);
    if (!msg->data) {
        free(msg);
        return -1;
    }
    
    memcpy(msg->data, data, len);
    msg->data[len] = '\0';
    msg->len = len;
    
    pthread_mutex_lock(&ws->mutex);
    
    if (ws->send_queue_tail) {
        ws->send_queue_tail->next = msg;
    } else {
        ws->send_queue = msg;
    }
    ws->send_queue_tail = msg;
    
    /* Wake the service thread to send the message.
     * lws_callback_on_writable() is only safe from within the lws
     * event-loop, so from other threads we use lws_cancel_service()
     * and let the service thread call lws_callback_on_writable(). */
    if (ws->wsi && ws->state == WS_STATE_CONNECTED) {
        if (ws->thread_running && pthread_equal(pthread_self(), ws->service_thread)) {
            lws_callback_on_writable(ws->wsi);
        } else if (ws->context) {
            lws_cancel_service(ws->context);
        }
    }
    
    pthread_mutex_unlock(&ws->mutex);
    return 0;
}

/* Send formatted message */
int ws_send_message(pong_websocket_t *ws, const char *container,
                    const char *func_id, const char *payload)
{
    if (!ws || !container || !func_id) return -1;
    
    /* Check if connected */
    pthread_mutex_lock(&ws->mutex);
    bool connected = (ws->state == WS_STATE_CONNECTED && ws->wsi != NULL);
    pthread_mutex_unlock(&ws->mutex);
    
    if (!connected) return -1;
    
    char *msg = ws_format_client_message(container, func_id, payload);
    if (!msg) return -1;
    
    int result = queue_message(ws, msg, strlen(msg));
    free(msg);
    return result;
}

/* Send raw message */
int ws_send_raw(pong_websocket_t *ws, const char *data, size_t len)
{
    if (!ws || !data) return -1;
    return queue_message(ws, data, len);
}

/* Subscribe to function ID */
int ws_subscribe(pong_websocket_t *ws, const char *func_id,
                 ws_message_callback_t callback, void *user_data)
{
    if (!ws || !func_id || !callback) return -1;
    
    ws_subscription_t *sub = calloc(1, sizeof(ws_subscription_t));
    if (!sub) return -1;
    
    sub->func_id = strdup(func_id);
    sub->callback = callback;
    sub->user_data = user_data;
    
    pthread_mutex_lock(&ws->mutex);
    sub->next = ws->subscriptions;
    ws->subscriptions = sub;
    pthread_mutex_unlock(&ws->mutex);
    
    return 0;
}

/* Unsubscribe from function ID */
void ws_unsubscribe(pong_websocket_t *ws, const char *func_id)
{
    if (!ws || !func_id) return;
    
    pthread_mutex_lock(&ws->mutex);
    
    ws_subscription_t *prev = NULL;
    ws_subscription_t *curr = ws->subscriptions;
    
    while (curr) {
        if (strcmp(curr->func_id, func_id) == 0) {
            if (prev) {
                prev->next = curr->next;
            } else {
                ws->subscriptions = curr->next;
            }
            free(curr->func_id);
            free(curr);
            break;
        }
        prev = curr;
        curr = curr->next;
    }
    
    pthread_mutex_unlock(&ws->mutex);
}

/* Unsubscribe all */
void ws_unsubscribe_all(pong_websocket_t *ws)
{
    if (!ws) return;
    
    pthread_mutex_lock(&ws->mutex);
    
    while (ws->subscriptions) {
        ws_subscription_t *sub = ws->subscriptions;
        ws->subscriptions = sub->next;
        free(sub->func_id);
        free(sub);
    }
    
    pthread_mutex_unlock(&ws->mutex);
}

/* Set callbacks */
void ws_set_callbacks(pong_websocket_t *ws,
                      void (*on_connected)(void *),
                      void (*on_disconnected)(void *),
                      void (*on_error)(const char *, void *),
                      void *user_data)
{
    if (!ws) return;
    
    pthread_mutex_lock(&ws->mutex);
    ws->on_connected = on_connected;
    ws->on_disconnected = on_disconnected;
    ws->on_error = on_error;
    ws->callback_user_data = user_data;
    pthread_mutex_unlock(&ws->mutex);
}

/* Service loop */
int ws_service(pong_websocket_t *ws, int timeout_ms)
{
    if (!ws || !ws->context) return -1;
    return lws_service(ws->context, timeout_ms);
}

/* Service thread function */
static void *service_thread_func(void *arg)
{
    pong_websocket_t *ws = (pong_websocket_t *)arg;
    
    while (1) {
        pthread_mutex_lock(&ws->mutex);
        bool running = ws->thread_running;
        bool has_pending = (ws->send_queue != NULL);
        struct lws *wsi = ws->wsi;
        pthread_mutex_unlock(&ws->mutex);
        
        if (!running) break;
        
        if (ws->context) {
            /* Trigger writable callback when messages are queued.
             * This is safe because we are inside the service thread. */
            if (has_pending && wsi) {
                lws_callback_on_writable(wsi);
            }
            lws_service(ws->context, 50);
        } else {
            usleep(50000);
        }
    }
    
    return NULL;
}

/* Start service thread */
int ws_start_service_thread(pong_websocket_t *ws)
{
    if (!ws) return -1;
    
    pthread_mutex_lock(&ws->mutex);
    if (ws->thread_running) {
        pthread_mutex_unlock(&ws->mutex);
        return 0;
    }
    ws->thread_running = true;
    pthread_mutex_unlock(&ws->mutex);
    
    if (pthread_create(&ws->service_thread, NULL, service_thread_func, ws) != 0) {
        ws->thread_running = false;
        return -1;
    }
    
    return 0;
}

/* Stop service thread */
void ws_stop_service_thread(pong_websocket_t *ws)
{
    if (!ws) return;
    
    pthread_mutex_lock(&ws->mutex);
    if (!ws->thread_running) {
        pthread_mutex_unlock(&ws->mutex);
        return;
    }
    ws->thread_running = false;
    
    /* Wake the service loop so it exits immediately instead of
     * blocking for up to 50 ms in lws_service(). */
    if (ws->context) {
        lws_cancel_service(ws->context);
    }
    pthread_mutex_unlock(&ws->mutex);
    
    pthread_join(ws->service_thread, NULL);
}

/* Format client message: container%funcId%payload */
char *ws_format_client_message(const char *container, const char *func_id,
                               const char *payload)
{
    size_t len = strlen(container) + strlen(func_id) + 
                 (payload ? strlen(payload) : 2) + 3;
    
    char *msg = malloc(len);
    if (!msg) return NULL;
    
    snprintf(msg, len, "%s%%%s%%%s", container, func_id, 
             payload ? payload : "{}");
    
    return msg;
}

/* Parse hub message: sourceContainer%funcId%code%payload */
int ws_parse_hub_message(const char *message,
                         char *container, size_t cont_len,
                         char *func_id, size_t func_len,
                         int *code,
                         char *payload, size_t payload_len)
{
    if (!message) return -1;
    
    const char *p1 = strchr(message, '%');
    if (!p1) return -1;
    
    const char *p2 = strchr(p1 + 1, '%');
    if (!p2) return -1;
    
    const char *p3 = strchr(p2 + 1, '%');
    if (!p3) return -1;
    
    /* Extract container */
    size_t len = p1 - message;
    if (container && cont_len > 0) {
        len = (len < cont_len - 1) ? len : cont_len - 1;
        strncpy(container, message, len);
        container[len] = '\0';
    }
    
    /* Extract func_id */
    len = p2 - p1 - 1;
    if (func_id && func_len > 0) {
        len = (len < func_len - 1) ? len : func_len - 1;
        strncpy(func_id, p1 + 1, len);
        func_id[len] = '\0';
    }
    
    /* Extract code */
    if (code) {
        *code = atoi(p2 + 1);
    }
    
    /* Extract payload */
    if (payload && payload_len > 0) {
        strncpy(payload, p3 + 1, payload_len - 1);
        payload[payload_len - 1] = '\0';
    }
    
    return 0;
}
