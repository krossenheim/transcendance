#!/usr/bin/env bash
set -euo pipefail

# refresh_kibana_fields.sh
# Pull Elasticsearch mappings for a pattern, build Kibana-compatible
# fields array, and PATCH the Kibana saved index-pattern object.
#
# Usage:
# ./refresh_kibana_fields.sh <INDEX_PATTERN_ID> [ES_USER] [ES_PASS] [ES_HOST] [KIBANA_HOST]
#
# Example:
# ./refresh_kibana_fields.sh a178dc29-bd40-43b3-a03a-165f07f7b3d7 elastic yourStrongPassword http://localhost:9200 http://localhost:5601

INDEX_PATTERN_ID="${1:-}"
ES_USER="${2:-elastic}"
ES_PASS="${3:-yourStrongPassword}"
ES_HOST="${4:-http://localhost:9200}"
KIBANA_HOST="${5:-http://localhost:5601}"
PATTERN="logs-*"

if [ -z "$INDEX_PATTERN_ID" ]; then
  echo "Index pattern id is required. Usage: $0 <INDEX_PATTERN_ID> [ES_USER] [ES_PASS] [ES_HOST] [KIBANA_HOST]"
  exit 1
fi

TMPMAP="/tmp/refresh_kibana_mapping.json"
TMPFIELDS="/tmp/refresh_kibana_fields.json"

echo "Fetching mapping for pattern $PATTERN from $ES_HOST ..."
curl -sS -u "${ES_USER}:${ES_PASS}" "${ES_HOST}/${PATTERN}/_mapping" -o "$TMPMAP"

echo "Building field list from mapping..."
# Simpler recursive approach: find all objects with a "type" key and
# compute a dotted path while filtering out the intermediate "properties" keys.
 jq -r '
   # Recursively walk mapping nodes gathering fields with their dotted paths.
   def walk(prefix; node):
     if node == null then []
     else
       (node.properties // {}) as $props
       | if ($props | length) == 0 then
           if node.type? then [{ path: (prefix | join(".")), es_type: node.type }] else [] end
         else
           [$props | to_entries[] | (.key as $k | .value as $v | walk(prefix + [$k]; $v))] | add
         end
     end;

   # The mapping response can be {index: {mappings: {...}}} or mapping directly.
   [ (.[]? // .) as $mappings
     | ($mappings.mappings // $mappings) as $maproot
     | walk([]; $maproot)
   ]
   | flatten
   | unique_by(.path)
   | map(
       { name: .path,
         type: (if .es_type == "date" then "date"
                elif (.es_type | test("keyword|ip|boolean|geo_point")) then .es_type
                elif .es_type == "text" then "text"
                elif (.es_type | test("integer|long|short|byte|float|double|scaled_float")) then "number"
                else .es_type end),
         esTypes: [.es_type],
         searchable: true,
         aggregatable: (if .es_type == "text" then false else true end),
         readFromDocValues: (if .es_type == "text" then false else true end)
       }
     )' "$TMPMAP" > "$TMPFIELDS"

echo "Fields generated: $(jq 'length' "$TMPFIELDS")"
echo "First 10 fields:"
jq '.[0:10]' "$TMPFIELDS"

# Kibana expects `attributes.fields` to be a JSON-string containing the array.
FIELDS_ESCAPED=$(jq -c -R . <(jq -c . "$TMPFIELDS"))

echo "Patching Kibana saved object index-pattern/$INDEX_PATTERN_ID ..."
# Try PATCH first; if Kibana returns 404, fall back to PUT (create/update with same id).
RESP_FILE="/tmp/kibana_savobj_resp.json"
HTTP_CODE=$(curl -sS -u "${ES_USER}:${ES_PASS}" -o "$RESP_FILE" -w "%{http_code}" -X PATCH "${KIBANA_HOST}/api/saved_objects/index-pattern/${INDEX_PATTERN_ID}" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  --data-binary "{\"attributes\":{\"fields\":${FIELDS_ESCAPED}}}")

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
  cat "$RESP_FILE" | jq
  echo "Patched saved object successfully."
else
  echo "PATCH returned HTTP $HTTP_CODE; will try PUT to create/update the saved object id."
  # Need to preserve title and timeFieldName if available; fetch existing saved object attrs if present
  EXISTING=$(curl -sS -u "${ES_USER}:${ES_PASS}" -X GET "${KIBANA_HOST}/api/saved_objects/index-pattern/${INDEX_PATTERN_ID}" -H "kbn-xsrf: true" || true)
  TITLE=$(echo "$EXISTING" | jq -r '.attributes.title // "logs-*"')
  TIMEFIELD=$(echo "$EXISTING" | jq -r '.attributes.timeFieldName // "@timestamp"')
  PAYLOAD=$(jq -n --arg t "$TITLE" --arg tf "$TIMEFIELD" --argjson f $FIELDS_ESCAPED '{attributes:{title:$t, timeFieldName:$tf, fields:$f}}')
  curl -sS -u "${ES_USER}:${ES_PASS}" -X PUT "${KIBANA_HOST}/api/saved_objects/index-pattern/${INDEX_PATTERN_ID}" \
    -H "kbn-xsrf: true" \
    -H "Content-Type: application/json" \
    --data-binary "$PAYLOAD" | jq
  echo "PUT complete. If Kibana UI is open, refresh the Data Views page or reopen Discover."
fi
