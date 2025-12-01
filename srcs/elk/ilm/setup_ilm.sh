#!/usr/bin/env bash
set -euo pipefail
ES_USER="${ES_USER:-elastic}"
ES_PASS="${ES_PASS:-${ELASTIC_PASSWORD:-changeme}}"
ES_URL="${ES_URL:-http://localhost:9200}"
CURL_OPTS=("-sS" "-u" "${ES_USER}:${ES_PASS}")

# Create ILM policy
curl "${CURL_OPTS[@]}" -X PUT "${ES_URL}/_ilm/policy/policy_transcendance" \
  -H 'Content-Type: application/json' \
  --data-binary @"$(dirname "$0")/policy_transcendance.json"

# Create index template
curl "${CURL_OPTS[@]}" -X PUT "${ES_URL}/_index_template/template_transcendance" \
  -H 'Content-Type: application/json' \
  --data-binary @"$(dirname "$0")/template_transcendance.json"

# Create rollover alias and initial write index if missing
EXISTS=$(curl "${CURL_OPTS[@]}" "${ES_URL}/transcendance-000001" -o /dev/null -w '%{http_code}')
if [[ "$EXISTS" != "200" ]]; then
  curl "${CURL_OPTS[@]}" -X PUT "${ES_URL}/transcendance-000001" \
    -H 'Content-Type: application/json' \
    -d '{
      "aliases": {
        "transcendance": {
          "is_write_index": true
        }
      }
    }'
fi

echo "ILM setup complete. Index alias 'transcendance' ready for rollover."