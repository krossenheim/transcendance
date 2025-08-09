#!/bin/bash
set -ex

cd /etc/nginx/ssl && bash sign_cert.sh && test -f /etc/nginx/ssl/*.crt && test -f /etc/nginx/ssl/*.key #Exec script with ENVs loaded

nginx -t

exec "$@" # Very important otherwise the CMD on the dockerfile won't really run. It also makes that CMD run as PID 1. Which is good.