#!/bin/sh
set -ex

if [ -z "${MESSAGE_FROM_DOCKER_NETWORK}" ]; then echo "ERROR: MESSAGE_FROM_DOCKER_NETWORK is not set" >&2; exit 1; fi
if [ -z "${FASTIFY_NODE_MAINJS}" ]; then echo "ERROR: FASTIFY_NODE_MAINJS is not set" >&2; exit 1; fi
if [ -z "${FASTIFY_BIND_TO}" ]; then echo "ERROR: FASTIFY_BIND_TO is not set" >&2; exit 1; fi
if [ -z "${FASTIFY_PORT}" ]; then echo "ERROR: FASTIFY_PORT is not set" >&2; exit 1; fi 

exec "$@" # Very important otherwise the CMD on the dockerfile won't really run. It also makes that CMD run as PID 1. Which is good. For reasons.