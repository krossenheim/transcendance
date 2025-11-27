#!/usr/bin/env bash
set -euo pipefail

# Usage: ELASTIC_PASSWORD=... ./deploy_elk_setup.sh
if [ -z "${ELASTIC_PASSWORD:-}" ]; then
  echo "Please set ELASTIC_PASSWORD environment variable before running. Example: ELASTIC_PASSWORD=yourStrongPassword $0"
  exit 1
fi

ES_HOST=${ES_HOST:-http://localhost:9200}

echo "Applying ILM policy..."
curl -sS -u elastic:${ELASTIC_PASSWORD} -X PUT "$ES_HOST/_ilm/policy/logs_policy" -H 'Content-Type: application/json' --data-binary @../ilm/logs_policy.json | jq .

echo "Applying index template..."
curl -sS -u elastic:${ELASTIC_PASSWORD} -X PUT "$ES_HOST/_index_template/logs_template" -H 'Content-Type: application/json' --data-binary @../templates/logs_template.json | jq .

echo "Creating initial write index logs-000001 and alias logs-write..."
curl -sS -u elastic:${ELASTIC_PASSWORD} -X PUT "$ES_HOST/logs-000001" -H 'Content-Type: application/json' -d'{"aliases":{"logs-write":{"is_write_index":true}}}' | jq .

echo "Setup complete. You can now send logs to Logstash or Elasticsearch."
