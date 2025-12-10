#!/bin/sh
set -ex

if [ -d "/etc/database_data" ]; then
    echo "Fixing permissions for /etc/database_data..."
    chown -R nodejs:nodejs /etc/database_data
fi

if [ -z "${TOKEN_ENCRYPTION_TOKEN}" ]; then echo "ERROR: TOKEN_ENCRYPTION_TOKEN is not set" >&2; exit 1; fi

exec gosu nodejs "$@"