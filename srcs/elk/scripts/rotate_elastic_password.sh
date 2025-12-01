#!/usr/bin/env bash
set -euo pipefail

# rotate_elastic_password.sh
# Rotate the built-in `elastic` user password and optionally update a `.env` file.
# Usage:
# ./rotate_elastic_password.sh <NEW_PASSWORD> [ES_HOST] [CURRENT_PASSWORD] [ENV_FILE]

NEW_PASS="${1:-}"
ES_HOST="${2:-http://localhost:9200}"
CURRENT_PASS="${3:-yourStrongPassword}"
ENV_FILE="${4:-../globals.env}"

if [ -z "$NEW_PASS" ]; then
  echo "Usage: $0 <NEW_PASSWORD> [ES_HOST] [CURRENT_PASSWORD] [ENV_FILE]"
  exit 1
fi

echo "Rotating elastic password on $ES_HOST"
curl -sS -u "elastic:${CURRENT_PASS}" -X POST "${ES_HOST}/_security/user/elastic/_password" -H "Content-Type: application/json" -d "{\"password\": \"${NEW_PASS}\"}" | jq || true

echo "Password rotate request sent. If successful, update environment files referencing ELASTIC_PASSWORD."
if [ -f "$ENV_FILE" ]; then
  echo "Updating $ENV_FILE with new password (backup saved as ${ENV_FILE}.bak)"
  cp "$ENV_FILE" "${ENV_FILE}.bak"
  # naive replace; assumes line begins with ELASTIC_PASSWORD=
  sed -i "s/^ELASTIC_PASSWORD=.*/ELASTIC_PASSWORD=${NEW_PASS}/" "$ENV_FILE" || echo "Could not update $ENV_FILE automatically; please edit manually."
  echo "Updated (or please edit ${ENV_FILE})."
fi

echo "Done. Remember to update any running services that use the old password."
exit 0
