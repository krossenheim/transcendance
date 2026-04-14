#ifndef UTILS_H
#define UTILS_H

#include <stdbool.h>
#include <stddef.h>

long    get_timestamp_ms(void);

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

#endif
