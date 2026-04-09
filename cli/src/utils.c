#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <time.h>
#include <unistd.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <errno.h>
#include <ctype.h>
#include "utils.h"
#include "cJSON.h"

static FILE *log_file = NULL;
static log_level_t min_log_level = LOG_INFO;
static const char *level_names[] = { "DEBUG", "INFO", "WARN", "ERROR" };


char *str_dup(const char *s)
{
    if (!s) return NULL;
    size_t len = strlen(s) + 1;
    char *copy = malloc(len);
    if (copy) memcpy(copy, s, len);
    return copy;
}

char *str_concat(const char *s1, const char *s2)
{
    if (!s1) return str_dup(s2);
    if (!s2) return str_dup(s1);
    
    size_t len1 = strlen(s1);
    size_t len2 = strlen(s2);
    char *result = malloc(len1 + len2 + 1);
    if (result) {
        memcpy(result, s1, len1);
        memcpy(result + len1, s2, len2 + 1);
    }
    return result;
}

char *str_concat3(const char *s1, const char *s2, const char *s3)
{
    char *temp = str_concat(s1, s2);
    char *result = str_concat(temp, s3);
    free(temp);
    return result;
}

char *str_trim(char *s)
{
    if (!s) return NULL;
    
    while (isspace((unsigned char)*s)) s++;
    
    if (*s == '\0') return s;
    
    char *end = s + strlen(s) - 1;
    while (end > s && isspace((unsigned char)*end)) end--;
    end[1] = '\0';
    
    return s;
}

int str_split(const char *s, char delim, char ***parts, int *count)
{
    if (!s || !parts || !count) return -1;
    
    int n = 1;
    const char *p = s;
    while (*p) {
        if (*p == delim) n++;
        p++;
    }
    
    *parts = malloc(n * sizeof(char *));
    if (!*parts) return -1;
    
    *count = 0;
    const char *start = s;
    p = s;
    
    while (1) {
        if (*p == delim || *p == '\0') {
            size_t len = p - start;
            (*parts)[*count] = malloc(len + 1);
            if (!(*parts)[*count]) {
                str_split_free(*parts, *count);
                return -1;
            }
            memcpy((*parts)[*count], start, len);
            (*parts)[*count][len] = '\0';
            (*count)++;
            
            if (*p == '\0') break;
            start = p + 1;
        }
        p++;
    }
    
    return 0;
}

void str_split_free(char **parts, int count)
{
    if (!parts) return;
    for (int i = 0; i < count; i++) {
        free(parts[i]);
    }
    free(parts);
}

char *path_join(const char *dir, const char *file)
{
    if (!dir || !*dir) return str_dup(file);
    if (!file || !*file) return str_dup(dir);
    
    size_t dir_len = strlen(dir);
    size_t file_len = strlen(file);
    int need_sep = (dir[dir_len - 1] != '/');
    
    char *result = malloc(dir_len + need_sep + file_len + 1);
    if (!result) return NULL;
    
    memcpy(result, dir, dir_len);
    if (need_sep) result[dir_len] = '/';
    memcpy(result + dir_len + need_sep, file, file_len + 1);
    
    return result;
}

char *path_expand_home(const char *path)
{
    if (!path || path[0] != '~') return str_dup(path);
    
    const char *home = getenv("HOME");
    if (!home) return str_dup(path);
    
    return str_concat(home, path + 1);
}

bool path_exists(const char *path)
{
    if (!path) return false;
    struct stat st;
    return stat(path, &st) == 0;
}

bool path_is_dir(const char *path)
{
    if (!path) return false;
    struct stat st;
    if (stat(path, &st) != 0) return false;
    return S_ISDIR(st.st_mode);
}

int path_mkdir_p(const char *path, int mode)
{
    if (!path) return -1;
    
    char *tmp = str_dup(path);
    if (!tmp) return -1;
    
    size_t len = strlen(tmp);
    if (tmp[len - 1] == '/') tmp[len - 1] = '\0';
    
    for (char *p = tmp + 1; *p; p++) {
        if (*p == '/') {
            *p = '\0';
            if (mkdir(tmp, mode) != 0 && errno != EEXIST) {
                free(tmp);
                return -1;
            }
            *p = '/';
        }
    }
    
    int result = mkdir(tmp, mode);
    free(tmp);
    return (result == 0 || errno == EEXIST) ? 0 : -1;
}

char *file_read_all(const char *path)
{
    if (!path) return NULL;
    
    FILE *f = fopen(path, "r");
    if (!f) return NULL;
    
    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    fseek(f, 0, SEEK_SET);
    
    if (size <= 0 || size > 10 * 1024 * 1024) {
        fclose(f);
        return NULL;
    }
    
    char *content = malloc(size + 1);
    if (!content) {
        fclose(f);
        return NULL;
    }
    
    size_t read = fread(content, 1, size, f);
    content[read] = '\0';
    fclose(f);
    
    return content;
}

int file_write_all(const char *path, const char *content, int mode)
{
    if (!path || !content) return -1;
    
    FILE *f = fopen(path, "w");
    if (!f) return -1;
    
    size_t len = strlen(content);
    size_t written = fwrite(content, 1, len, f);
    fclose(f);
    
    if (mode != 0) chmod(path, mode);
    
    return written == len ? 0 : -1;
}


char *json_get_string(const char *json, const char *key)
{
    if (!json || !key) return NULL;
    
    cJSON *root = cJSON_Parse(json);
    if (!root) return NULL;
    
    const cJSON *item = cJSON_GetObjectItem(root, key);
    char *result = NULL;
    
    if (item && cJSON_IsString(item) && item->valuestring) {
        result = str_dup(item->valuestring);
    }
    
    cJSON_Delete(root);
    return result;
}

int json_get_int(const char *json, const char *key, int default_val)
{
    if (!json || !key) return default_val;
    
    cJSON *root = cJSON_Parse(json);
    if (!root) return default_val;
    
    const cJSON *item = cJSON_GetObjectItem(root, key);
    int result = default_val;
    
    if (item && cJSON_IsNumber(item)) {
        result = item->valueint;
    }
    
    cJSON_Delete(root);
    return result;
}

double json_get_double(const char *json, const char *key, double default_val)
{
    if (!json || !key) return default_val;
    
    cJSON *root = cJSON_Parse(json);
    if (!root) return default_val;
    
    const cJSON *item = cJSON_GetObjectItem(root, key);
    double result = default_val;
    
    if (item && cJSON_IsNumber(item)) {
        result = item->valuedouble;
    }
    
    cJSON_Delete(root);
    return result;
}

bool json_get_bool(const char *json, const char *key, bool default_val)
{
    if (!json || !key) return default_val;
    
    cJSON *root = cJSON_Parse(json);
    if (!root) return default_val;
    
    const cJSON *item = cJSON_GetObjectItem(root, key);
    bool result = default_val;
    
    if (item) {
        if (cJSON_IsTrue(item)) result = true;
        else if (cJSON_IsFalse(item)) result = false;
    }
    
    cJSON_Delete(root);
    return result;
}

char *json_get_object(const char *json, const char *key)
{
    if (!json || !key) return NULL;
    
    cJSON *root = cJSON_Parse(json);
    if (!root) return NULL;
    
    const cJSON *item = cJSON_GetObjectItem(root, key);
    char *result = NULL;
    
    if (item && cJSON_IsObject(item)) {
        result = cJSON_PrintUnformatted(item);
    }
    
    cJSON_Delete(root);
    return result;
}

char *json_get_array(const char *json, const char *key)
{
    if (!json || !key) return NULL;
    
    cJSON *root = cJSON_Parse(json);
    if (!root) return NULL;
    
    const cJSON *item = cJSON_GetObjectItem(root, key);
    char *result = NULL;
    
    if (item && cJSON_IsArray(item)) {
        result = cJSON_PrintUnformatted(item);
    }
    
    cJSON_Delete(root);
    return result;
}

int json_array_length(const char *array_json)
{
    if (!array_json) return 0;
    
    cJSON *arr = cJSON_Parse(array_json);
    if (!arr || !cJSON_IsArray(arr)) {
        cJSON_Delete(arr);
        return 0;
    }
    
    int len = cJSON_GetArraySize(arr);
    cJSON_Delete(arr);
    return len;
}

char *json_array_get(const char *array_json, int index)
{
    if (!array_json || index < 0) return NULL;
    
    cJSON *arr = cJSON_Parse(array_json);
    if (!arr || !cJSON_IsArray(arr)) {
        cJSON_Delete(arr);
        return NULL;
    }
    
    const cJSON *item = cJSON_GetArrayItem(arr, index);
    char *result = NULL;
    
    if (item) {
        result = cJSON_PrintUnformatted(item);
    }
    
    cJSON_Delete(arr);
    return result;
}

double *json_array_to_doubles(const char *array_json, int *count)
{
    if (!array_json || !count) return NULL;
    
    cJSON *arr = cJSON_Parse(array_json);
    if (!arr || !cJSON_IsArray(arr)) {
        cJSON_Delete(arr);
        *count = 0;
        return NULL;
    }
    
    *count = cJSON_GetArraySize(arr);
    if (*count == 0) {
        cJSON_Delete(arr);
        return NULL;
    }
    
    double *result = malloc(*count * sizeof(double));
    if (!result) {
        cJSON_Delete(arr);
        *count = 0;
        return NULL;
    }
    
    for (int i = 0; i < *count; i++) {
        cJSON *item = cJSON_GetArrayItem(arr, i);
        result[i] = (item && cJSON_IsNumber(item)) ? item->valuedouble : 0.0;
    }
    
    cJSON_Delete(arr);
    return result;
}

int *json_array_to_ints(const char *array_json, int *count)
{
    if (!array_json || !count) return NULL;
    
    cJSON *arr = cJSON_Parse(array_json);
    if (!arr || !cJSON_IsArray(arr)) {
        cJSON_Delete(arr);
        *count = 0;
        return NULL;
    }
    
    *count = cJSON_GetArraySize(arr);
    if (*count == 0) {
        cJSON_Delete(arr);
        return NULL;
    }
    
    int *result = malloc(*count * sizeof(int));
    if (!result) {
        cJSON_Delete(arr);
        *count = 0;
        return NULL;
    }
    
    for (int i = 0; i < *count; i++) {
        cJSON *item = cJSON_GetArrayItem(arr, i);
        result[i] = (item && cJSON_IsNumber(item)) ? item->valueint : 0;
    }
    
    cJSON_Delete(arr);
    return result;
}

long get_timestamp_ms(void)
{
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return tv.tv_sec * 1000 + tv.tv_usec / 1000;
}

void sleep_ms(int ms)
{
    usleep(ms * 1000);
}


void log_init(const char *file_path, log_level_t level)
{
    if (file_path) {
        log_file = fopen(file_path, "a");
    }
    min_log_level = level;
}

void log_close(void)
{
    if (log_file) {
        fclose(log_file);
        log_file = NULL;
    }
}

void log_msg(log_level_t level, const char *fmt, ...)
{
    if (level < min_log_level) return;
    
    time_t now = time(NULL);
    const struct tm *tm_info = localtime(&now);
    char time_buf[32];
    strftime(time_buf, sizeof(time_buf), "%Y-%m-%d %H:%M:%S", tm_info);
    
    va_list args;
    FILE *out = log_file ? log_file : stderr;
    
    fprintf(out, "[%s] [%s] ", time_buf, level_names[level]);
    
    va_start(args, fmt);
    vfprintf(out, fmt, args);
    va_end(args);
    
    fprintf(out, "\n");
    fflush(out);
}


void *safe_malloc(size_t size)
{
    void *ptr = malloc(size);
    if (!ptr && size > 0) {
        LOG_ERROR("Memory allocation failed for %zu bytes", size);
        exit(1);
    }
    return ptr;
}

void *safe_realloc(void *ptr, size_t size)
{
    void *new_ptr = realloc(ptr, size);
    if (!new_ptr && size > 0) {
        LOG_ERROR("Memory reallocation failed for %zu bytes", size);
        exit(1);
    }
    return new_ptr;
}

void safe_free(void *ptr)
{
    free(ptr);
}


static const char hex[] = "0123456789ABCDEF";

char *url_encode(const char *s)
{
    if (!s) return NULL;
    
    size_t len = strlen(s);
    char *result = malloc(len * 3 + 1);
    if (!result) return NULL;
    
    char *p = result;
    while (*s) {
        unsigned char c = *s;
        if (isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') {
            *p++ = c;
        } else {
            *p++ = '%';
            *p++ = hex[c >> 4];
            *p++ = hex[c & 0x0F];
        }
        s++;
    }
    *p = '\0';
    
    return result;
}

char *url_decode(const char *s)
{
    if (!s) return NULL;
    
    size_t len = strlen(s);
    char *result = malloc(len + 1);
    if (!result) return NULL;
    
    char *p = result;
    while (*s) {
        if (*s == '%' && s[1] && s[2]) {
            int hi = 0, lo = 0;
            if (s[1] >= '0' && s[1] <= '9') hi = s[1] - '0';
            else if (s[1] >= 'A' && s[1] <= 'F') hi = s[1] - 'A' + 10;
            else if (s[1] >= 'a' && s[1] <= 'f') hi = s[1] - 'a' + 10;
            else { *p++ = *s++; continue; }
            
            if (s[2] >= '0' && s[2] <= '9') lo = s[2] - '0';
            else if (s[2] >= 'A' && s[2] <= 'F') lo = s[2] - 'A' + 10;
            else if (s[2] >= 'a' && s[2] <= 'f') lo = s[2] - 'a' + 10;
            else { *p++ = *s++; continue; }
            
            *p++ = (hi << 4) | lo;
            s += 3;
        } else if (*s == '+') {
            *p++ = ' ';
            s++;
        } else {
            *p++ = *s++;
        }
    }
    *p = '\0';
    
    return result;
}
