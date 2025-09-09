#!/bin/sh
set -ex

if [ -z "${CHATROOM_NODE_MAINJS}" ]; then echo "ERROR: CHATROOM_NODE_MAINJS is not set" >&2; exit 1; fi
if [ -z "${CHATROOM_BIND_TO}" ]; then echo "ERROR: CHATROOM_BIND_TO is not set" >&2; exit 1; fi
if [ -z "${COMMON_PORT_ALL_DOCKER_CONTAINERS}" ]; then echo "ERROR: COMMON_PORT_ALL_DOCKER_CONTAINERS is not set" >&2; exit 1; fi 

exec "$@" # Very important otherwise the CMD on the dockerfile won't really run. It also makes that CMD run as PID 1. Which is good. For reasons.