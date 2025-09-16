#!/bin/sh
set -ex

if [ -z "${SERVICE_MAINJS}" ]; then echo "ERROR: SERVICE_MAINJS is not set" >&2; exit 1; fi
if [ -z "${CONTAINER_NAME_REVERSE_PROXY}" ]; then echo "ERROR: CONTAINER_NAME_REVERSE_PROXY is not set" >&2; exit 1; fi
if [ -z "${BACKEND_HUB_BIND_TO}" ]; then echo "ERROR: BACKEND_HUB_BIND_TO is not set" >&2; exit 1; fi

exec "$@" # Very important otherwise the CMD on the dockerfile won't really run. It also makes that CMD run as PID 1. Which is good. For reasons.