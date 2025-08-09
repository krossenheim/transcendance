#!/bin/bash
set -ex

envsubst '${SERVER_NAME}' < /etc/nginx/mysite.conf.to_expand > /etc/nginx/sites-enabled/mysite.conf

cd /etc/nginx/ssl && bash sign_cert.sh && test -f  && test -f /etc/nginx/ssl/${SERVER_NAME}.key #Exec script with ENVs loaded

if [ ! -f "/etc/nginx/ssl/${SERVER_NAME}.crt" ]; then
  echo "/etc/nginx/ssl/${SERVER_NAME}.crt not found, aborting."
  exit 1
fi

if [ ! -f "/etc/nginx/ssl/${SERVER_NAME}.key" ]; then
  echo "/etc/nginx/ssl/${SERVER_NAME}.key  not found, aborting."
  exit 1
fi

nginx -t

exec "$@" # Very important otherwise the CMD on the dockerfile won't really run. It also makes that CMD run as PID 1. Which is good. For reasons.