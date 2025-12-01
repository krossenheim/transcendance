#!/usr/bin/env bash
set -euo pipefail

# push_ilm_policy.sh
# Push the ILM policy located at srcs/elk/ilm/logs_policy.json to Elasticsearch.
# Usage:
# ./push_ilm_policy.sh [ES_HOST] [ES_USER] [ES_PASS] [POLICY_PATH]

ES_HOST="${1:-http://localhost:9200}"
ES_USER="${2:-elastic}"
ES_PASS="${3:-yourStrongPassword}"
POLICY_PATH="${4:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/ilm/logs_policy.json}"
POLICY_NAME="logs_policy"

if [ ! -f "$POLICY_PATH" ]; then
  echo "ERROR: ILM policy file not found at $POLICY_PATH"
  exit 2
fi

echo "Pushing ILM policy $POLICY_NAME from $POLICY_PATH to $ES_HOST"
HTTP_CODE=$(curl -sS -o /tmp/ilm_resp.json -w "%{http_code}" -u "${ES_USER}:${ES_PASS}" \
  -X PUT "${ES_HOST}/_ilm/policy/${POLICY_NAME}" -H "Content-Type: application/json" --data-binary "@${POLICY_PATH}")

if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
  echo "Failed to push ILM policy (HTTP $HTTP_CODE):"
  cat /tmp/ilm_resp.json
  exit 3
fi

echo "ILM policy pushed successfully. Response:"
cat /tmp/ilm_resp.json | jq

echo "Done. If you haven't applied the index template yet, run apply_template_and_create_index.sh"
exit 0
