#!/usr/bin/env bash
set -euo pipefail

# generate_dev_certs.sh
# Generate development TLS certificates using the Elasticsearch certutil tool
# inside the Elasticsearch container and write them into srcs/elk/certs.
# Usage:
# ./generate_dev_certs.sh [ES_CONTAINER_NAME]

ES_CONTAINER="${1:-elasticsearch}"
OUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/certs"

mkdir -p "$OUT_DIR"

echo "Generating dev certificates using container '$ES_CONTAINER'..."

# Create a temporary working dir inside the container
TMPDIR_IN_CONTAINER=/tmp/es_certs_$$
sudo docker exec -u 0 "$ES_CONTAINER" bash -lc "mkdir -p $TMPDIR_IN_CONTAINER && chown elasticsearch:elasticsearch $TMPDIR_IN_CONTAINER"

# Run elasticsearch-certutil in the container to create a zip
# NOTE: certutil requires either a CA (--ca / --ca-cert / --ca-key) or --self-signed.
# For a simple development flow we create a self-signed CA and bundle using --self-signed.
echo "Running elasticsearch-certutil inside container $ES_CONTAINER (self-signed CA, PEM output)..."
# Use --pem to emit PEM files (avoids creation of password-protected PKCS#12 archives
# that prompt for a passphrase when run non-interactively).
sudo docker exec "$ES_CONTAINER" /usr/share/elasticsearch/bin/elasticsearch-certutil cert --name transcendance --out "$TMPDIR_IN_CONTAINER/certs.zip" --silent --self-signed --pem

# Verify the zip was created in the container
if ! sudo docker exec -u 0 "$ES_CONTAINER" bash -lc "test -f $TMPDIR_IN_CONTAINER/certs.zip" >/dev/null 2>&1; then
  echo "Error: certs.zip not found in container $ES_CONTAINER:$TMPDIR_IN_CONTAINER"
  echo "Check container logs for certutil errors."
  sudo docker exec -u 0 "$ES_CONTAINER" bash -lc "ls -la $TMPDIR_IN_CONTAINER || true"
  exit 1
fi

# Copy out the zip
sudo docker cp "$ES_CONTAINER:$TMPDIR_IN_CONTAINER/certs.zip" "$OUT_DIR/certs.zip"

# Unzip locally
unzip -o "$OUT_DIR/certs.zip" -d "$OUT_DIR"

# Clean up container tmpdir
sudo docker exec -u 0 "$ES_CONTAINER" bash -lc "rm -rf $TMPDIR_IN_CONTAINER"

echo "Certificates written to $OUT_DIR"

cat > "$OUT_DIR/README.md" <<'EOF'
Place these files into the container mounts and update your configs:
- elastic-certificates.p12 -> Elasticsearch keystore path
- http.p12 (or generated certs) -> Kibana server certificate and key if needed

To mount into compose, add to the elasticsearch and kibana services volumes:
  - ./srcs/elk/certs:/usr/share/elasticsearch/config/certs:ro
  - ./srcs/elk/certs:/usr/share/kibana/config/certs:ro

Then update `elasticsearch.yml` and `kibana.yml` to enable http/transport ssl.
EOF

echo "Done. See $OUT_DIR/README.md for next steps (mounting and config)."
exit 0
