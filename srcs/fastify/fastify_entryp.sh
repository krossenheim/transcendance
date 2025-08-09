#!/bin/sh
set -ex

# Check that any ${variable} expadns to something and never nothing!

for file in /app_to_expand/*; do
  echo "Checking variables in $file"
  vars=$(grep -o '\${[^}]*}' "$file" | tr -d '${}' | sort -u)

  for v in $vars; do
    val=$(eval echo \$$v)
    if [ -z "$val" ] && echo "$v" | grep -q "FASTIFY"; then
      echo "Error: environment variable '$v' is empty or unset (used in $file)"
      exit 1
    fi
  done
  #envsubst replaces all enviroment variables
  filename=$(basename "$file" .to_expand)
  envsubst < "$file" > "/app/$filename"
done


cd /app/

# rm -rf node_modules package-lock.json
# npm cache clean --force

npm install

exec "$@" # Very important otherwise the CMD on the dockerfile won't really run. It also makes that CMD run as PID 1. Which is good. For reasons.