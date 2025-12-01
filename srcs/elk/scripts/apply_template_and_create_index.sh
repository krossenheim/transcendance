#!/usr/bin/env bash
set -euo pipefail

# apply_template_and_create_index.sh
# Upload the index template and create the initial write index (logs-000001)
# Usage:
# ./apply_template_and_create_index.sh [ES_HOST] [ES_USER] [ES_PASS] [TEMPLATE_PATH] [INDEX_NAME]
# Defaults:
#   ES_HOST=http://localhost:9200
#   ES_USER=elastic
#   ES_PASS=yourStrongPassword
#   TEMPLATE_PATH=../templates/logs_template.json
#   INDEX_NAME=logs-000001

ES_HOST="${1:-http://localhost:9200}"
ES_USER="${2:-elastic}"
ES_PASS="${3:-yourStrongPassword}"
TEMPLATE_PATH="${4:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/templates/logs_template.json}"
INDEX_NAME="${5:-logs-000001}"
TEMPLATE_NAME="logs_template"
WRITE_ALIAS="logs-write"

echo "Using ES host: $ES_HOST"
echo "Template path: $TEMPLATE_PATH"

if [ ! -f "$TEMPLATE_PATH" ]; then
  echo "ERROR: template file not found at $TEMPLATE_PATH"
  exit 2
fi

# Upload template
echo "Uploading index template '$TEMPLATE_NAME'..."
HTTP_CODE=$(curl -sS -o /tmp/es_template_resp.json -w "%{http_code}" -u "${ES_USER}:${ES_PASS}" \
  -X PUT "${ES_HOST}/_index_template/${TEMPLATE_NAME}" \
  -H "Content-Type: application/json" --data-binary "@${TEMPLATE_PATH}")

if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
  echo "Failed to upload template (HTTP $HTTP_CODE):"
  cat /tmp/es_template_resp.json
  exit 3
fi

echo "Template uploaded successfully (HTTP $HTTP_CODE). Response:" 
cat /tmp/es_template_resp.json | jq

# Create initial write index if it does not exist
echo "Checking if index '$INDEX_NAME' exists..."
EXISTS_CODE=$(curl -s -o /dev/null -w "%{http_code}" -u "${ES_USER}:${ES_PASS}" -I "${ES_HOST}/${INDEX_NAME}")
if [ "$EXISTS_CODE" = "200" ]; then
  echo "Index '$INDEX_NAME' already exists. Skipping creation."
else
  echo "Creating index '$INDEX_NAME' with alias '$WRITE_ALIAS' as write index..."
  CREATE_PAYLOAD=$(cat <<EOF
{
  "aliases": {
    "${WRITE_ALIAS}": { "is_write_index": true }
  }
}
EOF
)
  curl -sS -u "${ES_USER}:${ES_PASS}" -X PUT "${ES_HOST}/${INDEX_NAME}" -H "Content-Type: application/json" -d "$CREATE_PAYLOAD" -o /tmp/es_create_index.json
  echo "Index creation response:"
  cat /tmp/es_create_index.json | jq
fi

echo "Done. The template is applied and index creation completed (if necessary)."

echo "Next: If you want ILM policy pushed, run your ILM policy script or use:"
echo "  curl -u elastic:yourStrongPassword -X PUT \"${ES_HOST}/_ilm/policy/logs_policy\" -H \"Content-Type: application/json\" -d @srcs/elk/ilm/logs_policy.json"

exit 0
