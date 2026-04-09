#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <curl/curl.h>
#include <pwd.h>
#include <unistd.h>
#include <sys/stat.h>
#include <fcntl.h>
#include "auth.h"
#include "utils.h"
#include "cJSON.h"

/* Response buffer for curl */
typedef struct {
    char    *data;
    size_t  size;
} response_buffer_t;

/* Curl write callback */
static size_t write_callback(void *contents, size_t size, size_t nmemb, void *userp)
{
    size_t realsize = size * nmemb;
    if (nmemb != 0 && realsize / nmemb != size) return 0; /* overflow check */
    response_buffer_t *buf = (response_buffer_t *)userp;
    
    char *ptr = realloc(buf->data, buf->size + realsize + 1);
    if (!ptr) return 0;
    
    buf->data = ptr;
    memcpy(&(buf->data[buf->size]), contents, realsize);
    buf->size += realsize;
    buf->data[buf->size] = '\0';
    
    return realsize;
}

/* Initialize a response buffer */
static void init_response(response_buffer_t *resp)
{
    resp->data = malloc(1);
    resp->size = 0;
    if (resp->data) resp->data[0] = '\0';
}

/* Free response buffer */
static void free_response(response_buffer_t *resp)
{
    if (resp->data) free(resp->data);
    resp->data = NULL;
    resp->size = 0;
}

/* Get config directory path */
static char *get_config_dir(void)
{
    const char *home = getenv("HOME");
    if (!home) {
        const struct passwd *pw = getpwuid(getuid());
        if (pw) home = pw->pw_dir;
    }
    if (!home) return NULL;
    
    char *path = malloc(512);
    if (!path) return NULL;
    snprintf(path, 512, "%s/.pong-cli", home);
    return path;
}

/* Get session file path */
static char *get_session_path(void)
{
    char *config_dir = get_config_dir();
    if (!config_dir) return NULL;
    
    mkdir(config_dir, 0700);
    
    char *path = malloc(512);
    if (!path) {
        free(config_dir);
        return NULL;
    }
    snprintf(path, 512, "%s/session.json", config_dir);
    free(config_dir);
    return path;
}

/* Perform HTTP POST request */
static int http_post(const char *url, const char *json_body, 
                     response_buffer_t *response, long *http_code)
{
    CURL *curl = curl_easy_init();
    if (!curl) return -1;
    
    struct curl_slist *headers = NULL;
    headers = curl_slist_append(headers, "Content-Type: application/json");
    
    init_response(response);
    
    curl_easy_setopt(curl, CURLOPT_URL, url);
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, json_body);
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, response);
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, 0L);
    curl_easy_setopt(curl, CURLOPT_SSL_VERIFYHOST, 0L);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 30L);
    
    CURLcode res = curl_easy_perform(curl);
    
    if (res == CURLE_OK) {
        curl_easy_getinfo(curl, CURLINFO_RESPONSE_CODE, http_code);
    } else {
        free_response(response);
    }
    
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);
    
    return (res == CURLE_OK) ? 0 : -1;
}

/* Build URL for API endpoint */
static void build_url(char *buffer, size_t size, const char *host, int port, const char *endpoint, bool use_ssl)
{
    snprintf(buffer, size, "%s://%s:%d%s", use_ssl ? "https" : "http", host, port, endpoint);
}

/* Parse login response */
static int parse_login_response(const char *json, auth_session_t *session)
{
    cJSON *root = cJSON_Parse(json);
    if (!root) return -1;
    
    const cJSON *requires_2fa = cJSON_GetObjectItem(root, "requires2FA");
    if (requires_2fa && cJSON_IsBool(requires_2fa) && cJSON_IsTrue(requires_2fa)) {
        session->needs_2fa = true;
        
        const cJSON *temp_token = cJSON_GetObjectItem(root, "tempToken");
        if (temp_token && cJSON_IsString(temp_token)) {
            strncpy(session->temp_2fa_token, temp_token->valuestring, 
                    sizeof(session->temp_2fa_token) - 1);
        }
        
        const cJSON *user_id = cJSON_GetObjectItem(root, "userId");
        if (user_id && cJSON_IsNumber(user_id)) {
            session->user_id = user_id->valueint;
        }
        
        cJSON_Delete(root);
        return 0;
    }
    
    const cJSON *tokens = cJSON_GetObjectItem(root, "tokens");
    if (tokens) {
        const cJSON *jwt = cJSON_GetObjectItem(tokens, "jwt");
        const cJSON *refresh = cJSON_GetObjectItem(tokens, "refresh");
        
        if (jwt && cJSON_IsString(jwt)) {
            strncpy(session->access_token, jwt->valuestring, 
                    sizeof(session->access_token) - 1);
        }
        if (refresh && cJSON_IsString(refresh)) {
            strncpy(session->refresh_token, refresh->valuestring,
                    sizeof(session->refresh_token) - 1);
        }
    }
    
    const cJSON *user = cJSON_GetObjectItem(root, "user");
    if (user) {
        const cJSON *id = cJSON_GetObjectItem(user, "id");
        const cJSON *username = cJSON_GetObjectItem(user, "username");
        const cJSON *email = cJSON_GetObjectItem(user, "email");
        
        if (id && cJSON_IsNumber(id)) {
            session->user_id = id->valueint;
        }
        if (username && cJSON_IsString(username)) {
            strncpy(session->username, username->valuestring,
                    sizeof(session->username) - 1);
        }
        if (email && cJSON_IsString(email)) {
            strncpy(session->email, email->valuestring,
                    sizeof(session->email) - 1);
        }
    }
    
    session->authenticated = (strlen(session->access_token) > 0);
    session->token_expires = time(NULL) + 600;
    
    cJSON_Delete(root);
    return 0;
}

/* Login - returns new session or NULL on failure */
auth_session_t *auth_login(const char *host, int port,
                           const char *username, const char *password)
{
    auth_session_t *session = calloc(1, sizeof(auth_session_t));
    if (!session) return NULL;
    
    char url[512];
    build_url(url, sizeof(url), host, port, "/public_api/auth/login", true);
    
    cJSON *body = cJSON_CreateObject();
    cJSON_AddStringToObject(body, "username", username);
    cJSON_AddStringToObject(body, "password", password);
    
    char *json_body = cJSON_PrintUnformatted(body);
    cJSON_Delete(body);
    
    if (!json_body) {
        free(session);
        return NULL;
    }
    
    response_buffer_t response;
    long http_code = 0;
    
    if (http_post(url, json_body, &response, &http_code) != 0) {
        free(json_body);
        free(session);
        return NULL;
    }
    
    free(json_body);
    
    if (http_code != 200 && http_code != 202) {
        free_response(&response);
        free(session);
        return NULL;
    }
    
    if (parse_login_response(response.data, session) != 0) {
        free_response(&response);
        free(session);
        return NULL;
    }
    
    strncpy(session->host, host, sizeof(session->host) - 1);
    session->port = port;
    
    free_response(&response);
    return session;
}

/* Load session from file */
auth_session_t *auth_load_session(void)
{
    char *path = get_session_path();
    if (!path) return NULL;
    
    FILE *f = fopen(path, "r");
    free(path);
    if (!f) return NULL;
    
    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    fseek(f, 0, SEEK_SET);
    
    if (size <= 0 || size > 65536) {
        fclose(f);
        return NULL;
    }
    
    char *data = malloc(size + 1);
    if (!data) {
        fclose(f);
        return NULL;
    }
    
    size_t read_size = fread(data, 1, size, f);
    fclose(f);
    data[read_size] = '\0';
    
    cJSON *root = cJSON_Parse(data);
    free(data);
    if (!root) return NULL;
    
    auth_session_t *session = calloc(1, sizeof(auth_session_t));
    if (!session) {
        cJSON_Delete(root);
        return NULL;
    }
    
    const cJSON *user_id = cJSON_GetObjectItem(root, "user_id");
    const cJSON *username = cJSON_GetObjectItem(root, "username");
    const cJSON *email = cJSON_GetObjectItem(root, "email");
    const cJSON *access_token = cJSON_GetObjectItem(root, "access_token");
    const cJSON *refresh_token = cJSON_GetObjectItem(root, "refresh_token");
    const cJSON *token_expires = cJSON_GetObjectItem(root, "token_expires");
    const cJSON *host = cJSON_GetObjectItem(root, "host");
    const cJSON *port = cJSON_GetObjectItem(root, "port");
    
    if (user_id) session->user_id = user_id->valueint;
    if (username && cJSON_IsString(username)) {
        strncpy(session->username, username->valuestring, sizeof(session->username) - 1);
    }
    if (email && cJSON_IsString(email)) {
        strncpy(session->email, email->valuestring, sizeof(session->email) - 1);
    }
    if (access_token && cJSON_IsString(access_token)) {
        strncpy(session->access_token, access_token->valuestring, sizeof(session->access_token) - 1);
    }
    if (refresh_token && cJSON_IsString(refresh_token)) {
        strncpy(session->refresh_token, refresh_token->valuestring, sizeof(session->refresh_token) - 1);
    }
    if (token_expires) session->token_expires = (time_t)token_expires->valuedouble;
    if (host && cJSON_IsString(host)) {
        strncpy(session->host, host->valuestring, sizeof(session->host) - 1);
    }
    if (port && cJSON_IsNumber(port)) session->port = port->valueint;
    
    session->authenticated = (strlen(session->access_token) > 0);
    
    cJSON_Delete(root);
    return session;
}

/* Save session to file */
int auth_save_session(const auth_session_t *session)
{
    if (!session) return -1;
    
    char *path = get_session_path();
    if (!path) return -1;
    
    cJSON *root = cJSON_CreateObject();
    cJSON_AddNumberToObject(root, "user_id", session->user_id);
    cJSON_AddStringToObject(root, "username", session->username);
    cJSON_AddStringToObject(root, "email", session->email);
    cJSON_AddStringToObject(root, "access_token", session->access_token);
    cJSON_AddStringToObject(root, "refresh_token", session->refresh_token);
    cJSON_AddNumberToObject(root, "token_expires", (double)session->token_expires);
    cJSON_AddStringToObject(root, "host", session->host);
    cJSON_AddNumberToObject(root, "port", session->port);
    
    char *json = cJSON_Print(root);
    cJSON_Delete(root);
    
    if (!json) {
        free(path);
        return -1;
    }
    
    int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC, 0600);
    free(path);
    if (fd < 0) {
        free(json);
        return -1;
    }
    FILE *f = fdopen(fd, "w");
    if (!f) {
        close(fd);
        free(json);
        return -1;
    }
    
    fprintf(f, "%s", json);
    fclose(f);
    free(json);
    
    return 0;
}

/* Destroy session */
void auth_destroy_session(auth_session_t *session)
{
    if (session) {
        memset(session, 0, sizeof(*session));
        free(session);
    }
}

/* Validate session - checks if token is still valid */
bool auth_validate_session(auth_session_t *session)
{
    if (!session) return false;
    if (!session->authenticated) return false;
    if (strlen(session->access_token) == 0) return false;
    
    if (session->token_expires > 0 && time(NULL) > session->token_expires) {
        if (auth_refresh_token(session) != 0) {
            return false;
        }
    }
    
    return true;
}

/* Verify 2FA code */
int auth_verify_2fa(auth_session_t *session, const char *code)
{
    if (!session || !code) return -1;
    
    const char *host = strlen(session->host) > 0 ? session->host : "localhost";
    int port = session->port > 0 ? session->port : 443;
    
    char url[512];
    snprintf(url, sizeof(url), "https://%s:%d/public_api/auth/2fa/verify-login", host, port);
    
    cJSON *body = cJSON_CreateObject();
    cJSON_AddStringToObject(body, "tempToken", session->temp_2fa_token);
    cJSON_AddStringToObject(body, "code", code);
    
    char *json_body = cJSON_PrintUnformatted(body);
    cJSON_Delete(body);
    
    if (!json_body) return -1;
    
    response_buffer_t response;
    long http_code = 0;
    
    if (http_post(url, json_body, &response, &http_code) != 0) {
        free(json_body);
        return -1;
    }
    
    free(json_body);
    
    if (http_code != 200) {
        free_response(&response);
        return -1;
    }
    
    if (parse_login_response(response.data, session) != 0) {
        free_response(&response);
        return -1;
    }
    
    session->needs_2fa = false;
    free_response(&response);
    return 0;
}

/* Refresh token */
int auth_refresh_token(auth_session_t *session)
{
    if (!session || strlen(session->refresh_token) == 0) return -1;
    
    const char *host = strlen(session->host) > 0 ? session->host : "localhost";
    int port = session->port > 0 ? session->port : 443;
    
    char url[512];
    snprintf(url, sizeof(url), "https://%s:%d/public_api/auth/refresh", host, port);
    
    cJSON *body = cJSON_CreateObject();
    cJSON_AddStringToObject(body, "token", session->refresh_token);
    
    char *json_body = cJSON_PrintUnformatted(body);
    cJSON_Delete(body);
    
    if (!json_body) return -1;
    
    response_buffer_t response;
    long http_code = 0;
    
    if (http_post(url, json_body, &response, &http_code) != 0) {
        free(json_body);
        return -1;
    }
    
    free(json_body);
    
    if (http_code != 200) {
        free_response(&response);
        return -1;
    }
    
    cJSON *root = cJSON_Parse(response.data);
    free_response(&response);
    
    if (!root) return -1;
    
    const cJSON *tokens = cJSON_GetObjectItem(root, "tokens");
    if (tokens) {
        const cJSON *jwt = cJSON_GetObjectItem(tokens, "jwt");
        const cJSON *refresh = cJSON_GetObjectItem(tokens, "refresh");
        
        if (jwt && cJSON_IsString(jwt)) {
            strncpy(session->access_token, jwt->valuestring,
                    sizeof(session->access_token) - 1);
        }
        if (refresh && cJSON_IsString(refresh)) {
            strncpy(session->refresh_token, refresh->valuestring,
                    sizeof(session->refresh_token) - 1);
        }
    }
    
    session->token_expires = time(NULL) + 600;
    cJSON_Delete(root);
    return 0;
}

/* Logout */
int auth_logout(auth_session_t *session)
{
    if (!session) return -1;
    
    char *path = get_session_path();
    if (path) {
        remove(path);
        free(path);
    }
    
    session->authenticated = false;
    session->access_token[0] = '\0';
    session->refresh_token[0] = '\0';
    
    return 0;
}
