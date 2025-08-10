#!/bin/bash
set -ex

mkdir -p /etc/nginx/sites-enabled/
envsubst '${SERVER_NAME}' < /etc/nginx/site-templates/mysite.conf.to_expand > /etc/nginx/sites-enabled/mysite.conf

mkdir -p /etc/nginx/ssl
cd /etc/nginx/ssl 

SUBJECT="/C=${SSL_C}/ST=${SSL_ST}/L=${SSL_LO}/O=${SSL_OP}/OU=${SSL_OU}/CN=${SERVER_NAME}" 
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

nginx -t

rm -f /var/www/html/index.nginx-debian.html

exec "$@" # Very important otherwise the CMD on the dockerfile won't really run. It also makes that CMD run as PID 1. Which is good. For reasons.