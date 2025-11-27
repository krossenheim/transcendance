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
if [ -z "${PONG_IPV4_ADDRESS}" ]; then echo "ERROR: PONG_IPV4_ADDRESS is not set" >&2; exit 1; fi
if [ -z "${USERS_IPV4_ADDRESS}" ]; then echo "ERROR: USERS_IPV4_ADDRESS is not set" >&2; exit 1; fi
if [ -z "${USERS_NAME}" ]; then echo "ERROR: USERS_NAME is not set" >&2; exit 1; fi
if [ -z "${PONG_NAME}" ]; then echo "ERROR: PONG_NAME is not set" >&2; exit 1; fi
if [ -z "${NGINX_NAME}" ]; then echo "ERROR: NGINX_NAME is not set" >&2; exit 1; fi
if [ -z "${CHATROOM_NAME}" ]; then echo "ERROR: CHATROOM_NAME is not set" >&2; exit 1; fi
if [ -z "${DATABASE_NAME}" ]; then echo "ERROR: DATABASE_NAME is not set" >&2; exit 1; fi
if [ -z "${AUTH_NAME}" ]; then echo "ERROR: AUTH_NAME is not set" >&2; exit 1; fi
if [ -z "${HUB_NAME}" ]; then echo "ERROR: HUB_NAME is not set" >&2; exit 1; fi
if [ -z "${ELASTIC_PASSWORD}" ]; then echo "ERROR: ELASTIC_PASSWORD is not set" >&2; exit 1; fi
if [ -z "${ELASTICSEARCH_IPV4_ADDRESS}" ]; then echo "ERROR: ELASTICSEARCH_IPV4_ADDRESS is not set" >&2; exit 1; fi
if [ -z "${LOGSTASH_IPV4_ADDRESS}" ]; then echo "ERROR: LOGSTASH_IPV4_ADDRESS is not set" >&2; exit 1; fi
if [ -z "${KIBANA_IPV4_ADDRESS}" ]; then echo "ERROR: KIBANA_IPV4_ADDRESS is not set" >&2; exit 1; fi
if [ -z "${VOLUMES_DIR}" ]; then echo "ERROR: VOLUMES_DIR is not set" >&2; exit 1; fi
