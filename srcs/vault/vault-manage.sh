#!/bin/bash
set -e

# =============================================================================
# Vault Production Init/Unseal Script
# =============================================================================
# This script handles:
# 1. First-time initialization (generates unseal keys and root token)
# 2. Unsealing on subsequent restarts
# 3. Populating initial secrets after first init
#
# IMPORTANT: Store the generated keys securely! Loss = data loss!
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEYS_FILE="${SCRIPT_DIR}/.vault-keys.json"
VAULT_CONTAINER="${VAULT_CONTAINER:-transcendance-vault}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Determine if we should use docker exec or direct vault CLI
USE_DOCKER=false
if ! command -v vault &> /dev/null; then
    if command -v docker &> /dev/null; then
        USE_DOCKER=true
        log_info "Using vault CLI via Docker container: $VAULT_CONTAINER"
    else
        log_error "Neither vault CLI nor docker found. Install one of them."
        exit 1
    fi
fi

# Wrapper function to run vault commands (locally or via docker)
vault_cmd() {
    if [ "$USE_DOCKER" = true ]; then
        docker exec -e VAULT_SKIP_VERIFY=true "$VAULT_CONTAINER" vault "$@"
    else
        VAULT_ADDR="${VAULT_ADDR:-https://127.0.0.1:8200}" VAULT_SKIP_VERIFY=true vault "$@"
    fi
}

# Wrapper for vault commands that need the token
vault_cmd_with_token() {
    local token="$1"
    shift
    if [ "$USE_DOCKER" = true ]; then
        docker exec -e VAULT_TOKEN="$token" -e VAULT_SKIP_VERIFY=true "$VAULT_CONTAINER" vault "$@"
    else
        VAULT_TOKEN="$token" VAULT_ADDR="${VAULT_ADDR:-https://127.0.0.1:8200}" VAULT_SKIP_VERIFY=true vault "$@"
    fi
}

# Wait for Vault to be responsive
wait_for_vault() {
    log_info "Waiting for Vault container to be responsive..."
    
    # First check if container is running
    if [ "$USE_DOCKER" = true ]; then
        if ! docker ps --format '{{.Names}}' | grep -q "^${VAULT_CONTAINER}$"; then
            log_error "Vault container '$VAULT_CONTAINER' is not running."
            log_error "Start it with: docker compose -f docker-compose.prod.yml up -d"
            exit 1
        fi
    fi
    
    local retries=30
    while [ $retries -gt 0 ]; do
        if vault_cmd status 2>/dev/null | grep -qE "Sealed|Initialized"; then
            log_info "Vault is responsive"
            return 0
        fi
        retries=$((retries - 1))
        sleep 2
    done
    log_error "Vault did not become responsive in time"
    exit 1
}

# Check Vault initialization status
check_init_status() {
    vault_cmd status -format=json 2>/dev/null | jq -r '.initialized' 2>/dev/null || echo "false"
}

# Check Vault seal status
check_seal_status() {
    vault_cmd status -format=json 2>/dev/null | jq -r '.sealed' 2>/dev/null || echo "true"
}

# Initialize Vault (first time only)
init_vault() {
    log_info "Initializing Vault..."
    
    if [ -f "$KEYS_FILE" ]; then
        log_error "Keys file already exists at $KEYS_FILE"
        log_error "If you want to reinitialize, delete this file and the vault data volume"
        exit 1
    fi
    
    # Initialize with 5 key shares, 3 required to unseal (Shamir's Secret Sharing)
    # Adjust these values based on your security requirements
    vault_cmd operator init \
        -key-shares=5 \
        -key-threshold=3 \
        -format=json > "$KEYS_FILE"
    
    # Secure the keys file
    chmod 600 "$KEYS_FILE"
    
    log_info "Vault initialized successfully!"
    log_warn "=============================================="
    log_warn "CRITICAL: Backup $KEYS_FILE immediately!"
    log_warn "Store unseal keys in separate secure locations."
    log_warn "Loss of keys = permanent data loss!"
    log_warn "=============================================="
    
    echo ""
    log_info "Root token and unseal keys saved to: $KEYS_FILE"
    echo ""
}

# Unseal Vault
unseal_vault() {
    log_info "Unsealing Vault..."
    
    if [ ! -f "$KEYS_FILE" ]; then
        log_error "Keys file not found at $KEYS_FILE"
        log_error "Cannot unseal without keys. Was Vault initialized?"
        exit 1
    fi
    
    # Read unseal keys from file
    local key_threshold=$(jq -r '.unseal_threshold' "$KEYS_FILE")
    
    for i in $(seq 0 $((key_threshold - 1))); do
        local key=$(jq -r ".unseal_keys_b64[$i]" "$KEYS_FILE")
        log_info "Applying unseal key $((i + 1)) of $key_threshold..."
        vault_cmd operator unseal "$key" > /dev/null
    done
    
    # Verify unsealed
    if [ "$(check_seal_status)" == "false" ]; then
        log_info "Vault successfully unsealed!"
    else
        log_error "Failed to unseal Vault"
        exit 1
    fi
}

# Get root token from keys file
get_root_token() {
    if [ -f "$KEYS_FILE" ]; then
        jq -r '.root_token' "$KEYS_FILE"
    else
        echo ""
    fi
}

# Bootstrap secrets and policies (run after init)
bootstrap_secrets() {
    log_info "Bootstrapping secrets and policies..."
    
    local root_token=$(get_root_token)
    if [ -z "$root_token" ] || [ "$root_token" == "null" ]; then
        log_error "Root token not found. Cannot bootstrap."
        exit 1
    fi
    
    # Enable KV v2 secrets engine
    log_info "Enabling KV v2 secrets engine..."
    vault_cmd_with_token "$root_token" secrets enable -path=secret -version=2 kv 2>/dev/null || log_warn "KV engine may already be enabled"
    
    # Write initial secrets
    log_info "Writing initial secrets..."
    
    # Generate random secrets
    local elastic_pass=$(openssl rand -base64 32)
    local jwt_secret=$(openssl rand -hex 32)
    local token_secret=$(openssl rand -hex 32)
    local totp_key=$(openssl rand -hex 32)
    local db_pass=$(openssl rand -base64 24)
    local blockchain_key=$(openssl rand -hex 32)
    
    # Elasticsearch password
    vault_cmd_with_token "$root_token" kv put secret/transcendance/elastic \
        ELASTIC_PASSWORD="$elastic_pass"
    
    # Auth service secrets
    vault_cmd_with_token "$root_token" kv put secret/transcendance/auth \
        JWT_SECRET="$jwt_secret" \
        GITHUB_CLIENT_ID="${GITHUB_CLIENT_ID:-YOUR_GITHUB_CLIENT_ID}" \
        GITHUB_CLIENT_SECRET="${GITHUB_CLIENT_SECRET:-YOUR_GITHUB_CLIENT_SECRET}"
    
    # Database service secrets
    vault_cmd_with_token "$root_token" kv put secret/transcendance/db \
        TOKEN_SECRET_KEY="$token_secret" \
        TOTP_MASTER_KEY="$totp_key" \
        DB_PASSWORD="$db_pass"
    
    # Blockchain/other service secrets
    vault_cmd_with_token "$root_token" kv put secret/transcendance/blockchain \
        PRIVATE_KEY="$blockchain_key"
    
    # Create policies
    log_info "Creating policies..."
    
    # Auth service policy
    if [ "$USE_DOCKER" = true ]; then
        docker exec -e VAULT_TOKEN="$root_token" -e VAULT_SKIP_VERIFY=true "$VAULT_CONTAINER" sh -c 'vault policy write auth-policy - <<EOF
path "secret/data/transcendance/auth" {
  capabilities = ["read"]
}
EOF'
        docker exec -e VAULT_TOKEN="$root_token" -e VAULT_SKIP_VERIFY=true "$VAULT_CONTAINER" sh -c 'vault policy write db-policy - <<EOF
path "secret/data/transcendance/db" {
  capabilities = ["read"]
}
EOF'
        docker exec -e VAULT_TOKEN="$root_token" -e VAULT_SKIP_VERIFY=true "$VAULT_CONTAINER" sh -c 'vault policy write elastic-policy - <<EOF
path "secret/data/transcendance/elastic" {
  capabilities = ["read"]
}
EOF'
        docker exec -e VAULT_TOKEN="$root_token" -e VAULT_SKIP_VERIFY=true "$VAULT_CONTAINER" sh -c 'vault policy write app-policy - <<EOF
path "secret/data/transcendance/*" {
  capabilities = ["read"]
}
EOF'
    else
        vault policy write auth-policy - <<EOF
path "secret/data/transcendance/auth" {
  capabilities = ["read"]
}
EOF
        vault policy write db-policy - <<EOF
path "secret/data/transcendance/db" {
  capabilities = ["read"]
}
EOF
        vault policy write elastic-policy - <<EOF
path "secret/data/transcendance/elastic" {
  capabilities = ["read"]
}
EOF
        vault policy write app-policy - <<EOF
path "secret/data/transcendance/*" {
  capabilities = ["read"]
}
EOF
    fi
    
    # Enable AppRole auth method (recommended for services)
    log_info "Enabling AppRole auth method..."
    vault_cmd_with_token "$root_token" auth enable approle 2>/dev/null || log_warn "AppRole may already be enabled"
    
    # Create AppRole for each service
    for service in auth db chat hub pong users nginx; do
        log_info "Creating AppRole for $service..."
        vault_cmd_with_token "$root_token" write auth/approle/role/$service \
            token_policies="app-policy" \
            token_ttl=1h \
            token_max_ttl=24h \
            secret_id_ttl=720h
    done
    
    log_info "Bootstrap complete!"
    echo ""
    log_info "=============================================="
    log_info "To create service tokens, use AppRole:"
    log_info "  vault read auth/approle/role/auth/role-id"
    log_info "  vault write -f auth/approle/role/auth/secret-id"
    log_info "=============================================="
}

# Create service tokens for initial deployment
create_service_tokens() {
    log_info "Creating service tokens..."
    
    local root_token=$(get_root_token)
    
    local tokens_dir="${SCRIPT_DIR}/.tokens"
    mkdir -p "$tokens_dir"
    chmod 700 "$tokens_dir"
    
    for service in auth db chat hub pong users nginx; do
        local role_id=$(vault_cmd_with_token "$root_token" read -format=json auth/approle/role/$service/role-id | jq -r '.data.role_id')
        local secret_id=$(vault_cmd_with_token "$root_token" write -format=json -f auth/approle/role/$service/secret-id | jq -r '.data.secret_id')
        
        # Get a token using AppRole
        local token=$(vault_cmd write -format=json auth/approle/login \
            role_id="$role_id" \
            secret_id="$secret_id" | jq -r '.auth.client_token')
        
        echo "$token" > "$tokens_dir/${service}.token"
        chmod 600 "$tokens_dir/${service}.token"
        
        log_info "Token for $service saved to $tokens_dir/${service}.token"
    done
    
    log_info "Service tokens created in $tokens_dir/"
}

# Print usage
usage() {
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  init        Initialize Vault (first time only)"
    echo "  unseal      Unseal Vault after restart"
    echo "  bootstrap   Populate secrets and policies (after init)"
    echo "  tokens      Create service tokens"
    echo "  status      Check Vault status"
    echo "  auto        Auto-detect and perform needed operations"
    echo ""
}

# Main command handler
case "${1:-auto}" in
    init)
        wait_for_vault
        if [ "$(check_init_status)" == "true" ]; then
            log_error "Vault is already initialized"
            exit 1
        fi
        init_vault
        unseal_vault
        bootstrap_secrets
        create_service_tokens
        ;;
    unseal)
        wait_for_vault
        if [ "$(check_seal_status)" == "false" ]; then
            log_info "Vault is already unsealed"
            exit 0
        fi
        unseal_vault
        ;;
    bootstrap)
        wait_for_vault
        if [ "$(check_seal_status)" == "true" ]; then
            log_error "Vault is sealed. Unseal first."
            exit 1
        fi
        bootstrap_secrets
        ;;
    tokens)
        wait_for_vault
        if [ "$(check_seal_status)" == "true" ]; then
            log_error "Vault is sealed. Unseal first."
            exit 1
        fi
        create_service_tokens
        ;;
    status)
        vault_cmd status
        ;;
    auto)
        wait_for_vault
        if [ "$(check_init_status)" == "false" ]; then
            log_info "Vault not initialized. Performing first-time setup..."
            init_vault
            unseal_vault
            bootstrap_secrets
            create_service_tokens
        elif [ "$(check_seal_status)" == "true" ]; then
            log_info "Vault is sealed. Unsealing..."
            unseal_vault
        else
            log_info "Vault is already initialized and unsealed"
        fi
        vault_cmd status
        ;;
    *)
        usage
        exit 1
        ;;
esac
