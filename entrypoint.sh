#!/bin/sh
set -ex
if [ -z "${TR_NETWORK_SUBNET}" ]; then echo "ERROR: TR_NETWORK_SUBNET is not set" >&2; exit 1; fi
if [ -z "${MESSAGE_FROM_DOCKER_NETWORK}" ]; then echo "ERROR: MESSAGE_FROM_DOCKER_NETWORK is not set" >&2; exit 1; fi
if [ -z "${COMMON_PORT_ALL_DOCKER_CONTAINERS}" ]; then echo "ERROR: COMMON_PORT_ALL_DOCKER_CONTAINERS is not set" >&2; exit 1; fi
if [ -z "${FORWARDED_SSL_PORT_FROM_NAT_HOST}" ]; then echo "ERROR: FORWARDED_SSL_PORT_FROM_NAT_HOST is not set" >&2; exit 1; fi
if [ -z "${NGINX_IPV4_ADDRESS}" ]; then echo "ERROR: NGINX_IPV4_ADDRESS is not set" >&2; exit 1; fi
if [ -z "${CHATROOM_IPV4_ADDRESS}" ]; then echo "ERROR: CHATROOM_IPV4_ADDRESS is not set" >&2; exit 1; fi
if [ -z "${DATABASE_IPV4_ADDRESS}" ]; then echo "ERROR: DATABASE_IPV4_ADDRESS is not set" >&2; exit 1; fi
if [ -z "${AUTH_IPV4_ADDRESS}" ]; then echo "ERROR: AUTH_IPV4_ADDRESS is not set" >&2; exit 1; fi
if [ -z "${HUB_IPV4_ADDRESS}" ]; then echo "ERROR: HUB_IPV4_ADDRESS is not set" >&2; exit 1; fi
if [ -z "${NGINX_NAME}" ]; then echo "ERROR: NGINX_NAME is not set" >&2; exit 1; fi
if [ -z "${CHATROOM_NAME}" ]; then echo "ERROR: CHATROOM_NAME is not set" >&2; exit 1; fi
if [ -z "${DATABASE_NAME}" ]; then echo "ERROR: DATABASE_NAME is not set" >&2; exit 1; fi
if [ -z "${AUTH_NAME}" ]; then echo "ERROR: AUTH_NAME is not set" >&2; exit 1; fi
if [ -z "${HUB_NAME}" ]; then echo "ERROR: HUB_NAME is not set" >&2; exit 1; fi
#!/bin/sh
set -ex

if [ -z "${SERVICE_MAINJS}" ]; then echo "ERROR: SERVICE_MAINJS is not set" >&2; exit 1; fi
if [ -z "${CHATROOM_BIND_TO}" ]; then echo "ERROR: CHATROOM_BIND_TO is not set" >&2; exit 1; fi
if [ -z "${COMMON_PORT_ALL_DOCKER_CONTAINERS}" ]; then echo "ERROR: COMMON_PORT_ALL_DOCKER_CONTAINERS is not set" >&2; exit 1; fi 

exec "$@" # Very important otherwise the CMD on the dockerfile won't really run. It also makes that CMD run as PID 1. Which is good. For reasons.