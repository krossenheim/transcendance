#include <stdio.h>
#include <stdlib.h>
#include <stdarg.h>
#include <time.h>
#include <sys/time.h>
#include "utils.h"

static FILE *log_file = NULL;
static log_level_t min_log_level = LOG_INFO;
static const char *level_names[] = { "DEBUG", "INFO", "WARN", "ERROR" };

long get_timestamp_ms(void)
{
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return tv.tv_sec * 1000 + tv.tv_usec / 1000;
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
