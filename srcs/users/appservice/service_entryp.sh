#!/bin/sh
set -ex

# #  your service entryp here # 

exec "$@" # Very important otherwise the CMD on the dockerfile won't really run. It also makes that CMD run as PID 1. Which is good. For reasons.