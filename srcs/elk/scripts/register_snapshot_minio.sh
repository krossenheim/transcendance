#!/usr/bin/env bash
set -euo pipefail

# register_snapshot_minio.sh
# Register an S3-compatible (MinIO) snapshot repository with Elasticsearch.
# Usage:
# ./register_snapshot_minio.sh <MINIO_URL> <MINIO_BUCKET> <MINIO_ACCESS_KEY> <MINIO_SECRET> [ES_HOST] [ES_USER] [ES_PASS]

MINIO_URL="${1:-http://minio:9000}"
MINIO_BUCKET="${2:-es-snapshots}"
MINIO_ACCESS_KEY="${3:-minioadmin}"
MINIO_SECRET="${4:-minioadmin}"
ES_HOST="${5:-http://localhost:9200}"
ES_USER="${6:-elastic}"
ES_PASS="${7:-yourStrongPassword}"
REPO_NAME="es_minio_repo"

# Register repo
echo "Registering snapshot repository ${REPO_NAME} -> ${MINIO_URL}/${MINIO_BUCKET}"
curl -u "${ES_USER}:${ES_PASS}" -sS -X PUT "${ES_HOST}/_snapshot/${REPO_NAME}" -H "Content-Type: application/json" -d "{
  \"type\": \"s3\",
  \"settings\": {
    \"bucket\": \"${MINIO_BUCKET}\",
    \"endpoint\": \"${MINIO_URL#http://}\",
    \"protocol\": \"http\",
    \"access_key\": \"${MINIO_ACCESS_KEY}\",
    \"secret_key\": \"${MINIO_SECRET}\",
    \"compress\": true
  }
}"

echo "Repository registered. You can create a snapshot with:"
echo "curl -u ${ES_USER}:<pass> -X PUT '${ES_HOST}/_snapshot/${REPO_NAME}/snap-$(date +%Y%m%d%H%M)?wait_for_completion=true' -H 'Content-Type: application/json' -d '{"indices":"logs-*","include_global_state":false}'"

exit 0
