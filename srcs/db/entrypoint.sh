#!/bin/sh
set -ex

if [ -d "/etc/database_data" ]; then
    echo "Fixing permissions for /etc/database_data..."
    chown -R nodejs:nodejs /etc/database_data
fi

exec su-exec nodejs "$@"