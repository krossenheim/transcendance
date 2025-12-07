#!/bin/bash
set -e

# =============================================================================
# Generate TLS Certificates for Vault
# =============================================================================
# Creates a self-signed CA and server certificate for Vault TLS
# For production, use certificates from a trusted CA (Let's Encrypt, etc.)
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TLS_DIR="${SCRIPT_DIR}/tls"
VAULT_DOMAIN="${VAULT_DOMAIN:-vault}"
VALIDITY_DAYS="${VALIDITY_DAYS:-365}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# Create TLS directory
mkdir -p "$TLS_DIR"
cd "$TLS_DIR"

log_info "Generating TLS certificates in $TLS_DIR"

# Generate CA private key
log_info "Generating CA private key..."
openssl genrsa -out ca-key.pem 4096

# Generate CA certificate
log_info "Generating CA certificate..."
openssl req -new -x509 -days $VALIDITY_DAYS -key ca-key.pem -sha256 -out ca-cert.pem \
    -subj "/C=US/ST=State/L=City/O=Transcendance/OU=Infrastructure/CN=Vault CA"

# Generate server private key
log_info "Generating server private key..."
openssl genrsa -out vault-key.pem 4096

# Create server CSR config
cat > vault-csr.conf <<EOF
[req]
default_bits = 4096
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = req_ext

[dn]
C = US
ST = State
L = City
O = Transcendance
OU = Infrastructure
CN = ${VAULT_DOMAIN}

[req_ext]
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${VAULT_DOMAIN}
DNS.2 = localhost
DNS.3 = vault
DNS.4 = transcendance-vault
IP.1 = 127.0.0.1
IP.2 = 0.0.0.0
EOF

# Generate server CSR
log_info "Generating server CSR..."
openssl req -new -key vault-key.pem -out vault.csr -config vault-csr.conf

# Create extensions file for signing
cat > vault-ext.conf <<EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${VAULT_DOMAIN}
DNS.2 = localhost
DNS.3 = vault
DNS.4 = transcendance-vault
IP.1 = 127.0.0.1
IP.2 = 0.0.0.0
EOF

# Sign the server certificate with CA
log_info "Signing server certificate..."
openssl x509 -req -days $VALIDITY_DAYS -sha256 \
    -in vault.csr \
    -CA ca-cert.pem \
    -CAkey ca-key.pem \
    -CAcreateserial \
    -out vault-cert.pem \
    -extfile vault-ext.conf

# Clean up intermediate files
rm -f vault.csr vault-csr.conf vault-ext.conf ca-cert.srl

# Set permissions
chmod 600 vault-key.pem ca-key.pem
chmod 644 vault-cert.pem ca-cert.pem

log_info "TLS certificates generated successfully!"
echo ""
log_info "Files created:"
echo "  - ca-cert.pem     : CA certificate (distribute to clients)"
echo "  - ca-key.pem      : CA private key (keep secure!)"
echo "  - vault-cert.pem  : Server certificate"
echo "  - vault-key.pem   : Server private key (keep secure!)"
echo ""
log_warn "For production, consider using certificates from a trusted CA"
log_warn "(Let's Encrypt, DigiCert, etc.) instead of self-signed certificates."
