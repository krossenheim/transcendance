#!/usr/bin/env bash
set -euo pipefail
# Registers an S3-compatible snapshot repository (e.g., MinIO)
ES_USER="${ES_USER:-elastic}"
ES_PASS="${ES_PASS:-${ELASTIC_PASSWORD:-changeme}}"
ES_URL="${ES_URL:-https://localhost:9200}"
REPO_NAME="${REPO_NAME:-transcendance-snapshots}"
S3_ENDPOINT="${S3_ENDPOINT:-http://minio:9000}"
S3_BUCKET="${S3_BUCKET:-elk-snapshots}"
S3_ACCESS_KEY="${S3_ACCESS_KEY:-minioadmin}"
S3_SECRET_KEY="${S3_SECRET_KEY:-minioadmin}"
REGION="${REGION:-us-east-1}"

CURL_OPTS=("-sS" "-k" "-u" "${ES_USER}:${ES_PASS}")

curl "${CURL_OPTS[@]}" -X PUT "${ES_URL}/_snapshot/${REPO_NAME}" \
  -H 'Content-Type: application/json' \
  -d "{\n    \"type\": \"s3\",\n    \"settings\": {\n      \"bucket\": \"${S3_BUCKET}\",\n      \"endpoint\": \"${S3_ENDPOINT}\",\n      \"access_key\": \"${S3_ACCESS_KEY}\",\n      \"secret_key\": \"${S3_SECRET_KEY}\",\n      \"region\": \"${REGION}\",\n      \"path_style_access\": true\n    }\n  }"

echo "Snapshot repository '${REPO_NAME}' registered (S3-compatible)."