#!/bin/bash
set -ex


mkdir -p /etc/nginx/sites-enabled/
if [ -z "${MESSAGE_FROM_DOCKER_NETWORK}" ]; then echo "ERROR: MESSAGE_FROM_DOCKER_NETWORK is not set" >&2; exit 1; fi
if [ -z "${TR_NETWORK_SUBNET}" ]; then echo "ERROR: TR_NETWORK_SUBNET is not set" >&2; exit 1; fi
if [ -z "${SERVER_NAME}" ]; then echo "ERROR: SERVER_NAME is not set" >&2; exit 1; fi
if [ -z "${SUBJECT}" ]; then echo "ERROR: SUBJECT is not set" >&2; exit 1; fi

#multiple vars can be done by ont typing argumnets to envsubst other than input and output files (Itll try to replace all env vars found inside)
envsubst '${SERVER_NAME} ${MESSAGE_FROM_DOCKER_NETWORK}' < /etc/nginx/un_expanded/mysite.conf.to_expand > /etc/nginx/sites-enabled/mysite.conf
envsubst '${TR_NETWORK_SUBNET}' < /etc/nginx/un_expanded/nginx.conf.to_expand > /etc/nginx/nginx.conf

mkdir -p /etc/nginx/ssl
cd /etc/nginx/ssl 

echo "Signing certificate with server name ${SUBJECT}";
openssl req -x509 -newkey rsa:4086 -keyout ${SERVER_NAME}.key -out ${SERVER_NAME}.crt -days 666 -nodes -subj "$SUBJECT"

cd

if [ ! -f "/etc/nginx/ssl/${SERVER_NAME}.crt" ]; then
  echo "/etc/nginx/ssl/${SERVER_NAME}.crt not found, aborting."
  exit 1
fi

if [ ! -f "/etc/nginx/ssl/${SERVER_NAME}.key" ]; then
  echo "/etc/nginx/ssl/${SERVER_NAME}.key  not found, aborting."
  exit 1
fi

rm -f /var/www/html/index.nginx-debian.html


if ! nginx -t; then
  cat /etc/nginx/nginx.conf
  cat /etc/nginx/sites-enabled/mysite.conf
  tail -f /dev/null  # keep container alive or
fi



exec "$@" # Very important otherwise the CMD on the dockerfile won't really run. It also makes that CMD run as PID 1. Which is good. For reasons.