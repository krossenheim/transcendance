#!/bin/bash
set -ex

mkdir -p /etc/nginx/sites-enabled/

if [ -z "${WEBSOCKET_TIMEOUT}" ]; then echo "ERROR: WEBSOCKET_TIMEOUT is not set" >&2; exit 1; fi
if [ -z "${COMMON_PORT_ALL_DOCKER_CONTAINERS}" ]; then echo "ERROR: COMMON_PORT_ALL_DOCKER_CONTAINERS is not set" >&2; exit 1; fi
if [ -z "${FORWARDED_SSL_PORT_FROM_NAT_HOST}" ]; then echo "ERROR: FORWARDED_SSL_PORT_FROM_NAT_HOST is not set" >&2; exit 1; fi
if [ -z "${MESSAGE_FROM_DOCKER_NETWORK}" ]; then echo "ERROR: MESSAGE_FROM_DOCKER_NETWORK is not set" >&2; exit 1; fi
if [ -z "${TR_NETWORK_SUBNET}" ]; then echo "ERROR: TR_NETWORK_SUBNET is not set" >&2; exit 1; fi
if [ -z "${HUB_NAME}" ]; then echo "ERROR: '${HUB_NAME}' (in between docker containers and behind nginx.) is not set" >&2; exit 1; fi
if [ -z "${PONG_NAME}" ]; then echo "ERROR: '${PONG_NAME}' (in between docker containers and behind nginx.) is not set" >&2; exit 1; fi
if [ -z "${USERS_NAME}" ]; then echo "ERROR: '${USERS_NAME}' (in between docker containers and behind nginx.) is not set" >&2; exit 1; fi
if [ -z "${SERVER_NAME}" ]; then echo "ERROR: SERVER_NAME is not set" >&2; exit 1; fi
if [ -z "${SUBJECT}" ]; then echo "ERROR: SUBJECT is not set" >&2; exit 1; fi

#multiple vars can be done by ont typing argumnets to envsubst other than input and output files (Itll try to replace all env vars found inside)
envsubst '${SERVER_NAME} 
${MESSAGE_FROM_DOCKER_NETWORK} 
${WEBSOCKET_TIMEOUT}
${COMMON_PORT_ALL_DOCKER_CONTAINERS} 
${HUB_NAME}
${USERS_NAME}
${PONG_NAME}
${FORWARDED_SSL_PORT_FROM_NAT_HOST}' < /etc/nginx/un_expanded/mysite.conf.to_expand > /etc/nginx/sites-enabled/mysite.conf

envsubst '${TR_NETWORK_SUBNET}' < /etc/nginx/un_expanded/nginx.conf.to_expand > /etc/nginx/nginx.conf

mkdir -p /etc/nginx/ssl
cd /etc/nginx/ssl 

if [ ! -f "/etc/nginx/ssl/${SERVER_NAME}.key" ] || [ ! -f "/etc/nginx/ssl/${SERVER_NAME}.crt" ]; then
  echo "SSL certificate or key not found, generating self-signed certificate and key for ${SERVER_NAME}"

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
    echo "Command 'nginx -t' failed, above are the configs!"
    tail -f /dev/null  # keep container alive or
  fi
fi


exec "$@" # Very important otherwise the CMD on the dockerfile won't really run. It also makes that CMD run as PID 1. Which is good. For reasons.