#ifndef UTILS_H
#define UTILS_H

#include <stdbool.h>
#include <stddef.h>

char    *str_dup(const char *s);
char    *str_concat(const char *s1, const char *s2);
char    *str_concat3(const char *s1, const char *s2, const char *s3);
char    *str_trim(char *s);
int     str_split(const char *s, char delim, char ***parts, int *count);
void    str_split_free(char **parts, int count);

char    *path_join(const char *dir, const char *file);
char    *path_expand_home(const char *path);
bool    path_exists(const char *path);
bool    path_is_dir(const char *path);
int     path_mkdir_p(const char *path, int mode);

char    *file_read_all(const char *path);
int     file_write_all(const char *path, const char *content, int mode);

char    *json_get_string(const char *json, const char *key);
int     json_get_int(const char *json, const char *key, int default_val);
double  json_get_double(const char *json, const char *key, double default_val);
bool    json_get_bool(const char *json, const char *key, bool default_val);
char    *json_get_object(const char *json, const char *key);
char    *json_get_array(const char *json, const char *key);

int     json_array_length(const char *array_json);
char    *json_array_get(const char *array_json, int index);
double  *json_array_to_doubles(const char *array_json, int *count);
int     *json_array_to_ints(const char *array_json, int *count);

long    get_timestamp_ms(void);
void    sleep_ms(int ms);

typedef enum {
    LOG_DEBUG,
    LOG_INFO,
    LOG_WARN,
    LOG_ERROR,
} log_level_t;

void    log_init(const char *file_path, log_level_t min_level);
void    log_close(void);
void    log_msg(log_level_t level, const char *fmt, ...);

#define LOG_DEBUG(fmt, ...) log_msg(LOG_DEBUG, fmt, ##__VA_ARGS__)
#define LOG_INFO(fmt, ...)  log_msg(LOG_INFO, fmt, ##__VA_ARGS__)
#define LOG_WARN(fmt, ...)  log_msg(LOG_WARN, fmt, ##__VA_ARGS__)
#define LOG_ERROR(fmt, ...) log_msg(LOG_ERROR, fmt, ##__VA_ARGS__)

void    *safe_malloc(size_t size);
void    *safe_realloc(void *ptr, size_t size);
void    safe_free(void *ptr);

char    *url_encode(const char *s);
char    *url_decode(const char *s);

#endif 
