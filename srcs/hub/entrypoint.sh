#!/bin/sh
set -ex

if [ -z "${SERVICE_MAINJS}" ]; then echo "ERROR: SERVICE_MAINJS is not set" >&2; exit 1; fi
if [ -z "${PUBLICFACING_WEBSERVER_NAME}" ]; then echo "ERROR: PUBLICFACING_WEBSERVER_NAME is not set" >&2; exit 1; fi
if [ -z "${BACKEND_HUB_BIND_TO}" ]; then echo "ERROR: BACKEND_HUB_BIND_TO is not set" >&2; exit 1; fi

exec "$@"