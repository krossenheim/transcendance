#!/usr/bin/env bash
set -euo pipefail

# create_security_users.sh
# Create roles, a Logstash API key, and example Kibana users for the ELK stack.
# Usage:
# ./create_security_users.sh [ES_HOST] [ES_USER] [ES_PASS]

ES_HOST="${1:-http://localhost:9200}"
ES_USER="${2:-elastic}"
ES_PASS="${3:-yourStrongPassword}"

echo "Creating role: logstash_writer"
curl -sS -u "${ES_USER}:${ES_PASS}" -X POST "${ES_HOST}/_security/role/logstash_writer" -H "Content-Type: application/json" -d '{
  "cluster": ["monitor"],
  "indices": [
    {"names":["logs-*"], "privileges":["create_index","write","create"]}
  ]
}' | jq || true

echo "Creating read-only role: kibana_readonly"
curl -sS -u "${ES_USER}:${ES_PASS}" -X POST "${ES_HOST}/_security/role/kibana_readonly" -H "Content-Type: application/json" -d '{
  "cluster": ["monitor"],
  "indices": [
    {"names":["logs-*"], "privileges":["read"]},
    {"names":[".kibana*"], "privileges":["read"]}
  ]
}' | jq || true

# Create a sample user for human Kibana access (optional)
read -r -p "Create example Kibana user 'kibana_user'? [y/N] " create_kibana_user
if [[ "$create_kibana_user" =~ ^[Yy]$ ]]; then
  read -r -p "Enter password for kibana_user (or press enter to auto-generate): " kb_pass
  if [ -z "$kb_pass" ]; then
    kb_pass=$(openssl rand -base64 14)
    echo "Generated password: $kb_pass"
  fi
  curl -sS -u "${ES_USER}:${ES_PASS}" -X POST "${ES_HOST}/_security/user/kibana_user" -H "Content-Type: application/json" -d "{
    \"password\": \"${kb_pass}\",
    \"roles\": [\"kibana_readonly\"],
    \"full_name\": \"Kibana Readonly User\"
  }" | jq || true
fi

# Create Logstash API key (preferred over a user password)
echo "Creating Logstash API key (will print id and api_key). Keep this secret."
API_KEY_JSON=$(curl -sS -u "${ES_USER}:${ES_PASS}" -X POST "${ES_HOST}/_security/api_key" -H "Content-Type: application/json" -d '{
  "name": "logstash-api-key",
  "role_descriptors": {
    "logstash_writer": {
      "cluster": ["monitor"],
      "index": [{"names":["logs-*"],"privileges":["create_index","write","create"]}]
    }
  }
}')

echo "$API_KEY_JSON" | jq

cat <<'EOF'
Save the returned 'id' and 'api_key' (or the combined format 'id:api_key') and use in Logstash config like:

  output {
    elasticsearch {
      hosts => ["http://elasticsearch:9200"]
      api_key => "<id>:<api_key>"
      index => "logs-write"
    }
  }

EOF

exit 0
