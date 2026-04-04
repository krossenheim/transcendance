#!/bin/sh
set -ex

if [ -z "${SERVICE_MAINJS}" ]; then echo "ERROR: SERVICE_MAINJS is not set" >&2; exit 1; fi
if [ -z "${PONG_BIND_TO}" ]; then echo "ERROR: PONG_BIND_TO is not set" >&2; exit 1; fi
if [ -z "${COMMON_PORT_ALL_DOCKER_CONTAINERS}" ]; then echo "ERROR: COMMON_PORT_ALL_DOCKER_CONTAINERS is not set" >&2; exit 1; fi 

exec "$@"