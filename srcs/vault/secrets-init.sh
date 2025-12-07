#!/bin/bash
# =============================================================================
# Secrets Initialization Script
# =============================================================================
# Run this after `vault-manage.sh init` to set your real secrets.
# This file is gitignored - your secrets stay local.
#
# Usage: sudo ./secrets-init.sh
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEYS_FILE="${SCRIPT_DIR}/.vault-keys.json"
VAULT_CONTAINER="${VAULT_CONTAINER:-transcendance-vault}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
prompt() { echo -e "${CYAN}$1${NC}"; }

# Check prerequisites
if [ ! -f "$KEYS_FILE" ]; then
    log_error "Vault keys not found at $KEYS_FILE"
    log_error "Run './vault-manage.sh init' first!"
    exit 1
fi

ROOT_TOKEN=$(jq -r '.root_token' "$KEYS_FILE")
if [ -z "$ROOT_TOKEN" ] || [ "$ROOT_TOKEN" == "null" ]; then
    log_error "Could not read root token from $KEYS_FILE"
    exit 1
fi

# Function to run vault commands
vault_put() {
    docker exec -e VAULT_TOKEN="$ROOT_TOKEN" -e VAULT_SKIP_VERIFY=true \
        "$VAULT_CONTAINER" vault kv put "$@"
}

vault_patch() {
    docker exec -e VAULT_TOKEN="$ROOT_TOKEN" -e VAULT_SKIP_VERIFY=true \
        "$VAULT_CONTAINER" vault kv patch "$@"
}

echo ""
echo "========================================"
echo "   Vault Secrets Initialization"
echo "========================================"
echo ""
log_info "This script will set your production secrets in Vault."
log_warn "Leave blank to keep existing/generated values."
echo ""

# GitHub OAuth
echo "----------------------------------------"
prompt "GitHub OAuth Credentials"
echo "(Get these from https://github.com/settings/developers)"
echo ""

read -p "GITHUB_CLIENT_ID: " GITHUB_CLIENT_ID
read -p "GITHUB_CLIENT_SECRET: " GITHUB_CLIENT_SECRET

if [ -n "$GITHUB_CLIENT_ID" ] || [ -n "$GITHUB_CLIENT_SECRET" ]; then
    log_info "Updating GitHub OAuth credentials..."
    ARGS=""
    [ -n "$GITHUB_CLIENT_ID" ] && ARGS="$ARGS GITHUB_CLIENT_ID=$GITHUB_CLIENT_ID"
    [ -n "$GITHUB_CLIENT_SECRET" ] && ARGS="$ARGS GITHUB_CLIENT_SECRET=$GITHUB_CLIENT_SECRET"
    vault_patch secret/transcendance/auth $ARGS > /dev/null
    log_info "GitHub credentials updated!"
else
    log_info "Skipping GitHub credentials (keeping existing values)"
fi

echo ""

# Database password
echo "----------------------------------------"
prompt "Database Credentials"
echo ""

read -p "DB_PASSWORD (leave blank for auto-generated): " DB_PASSWORD

if [ -n "$DB_PASSWORD" ]; then
    log_info "Updating database password..."
    vault_patch secret/transcendance/db DB_PASSWORD="$DB_PASSWORD" > /dev/null
    log_info "Database password updated!"
else
    log_info "Keeping auto-generated database password"
fi

echo ""

# Elasticsearch
echo "----------------------------------------"
prompt "Elasticsearch Credentials"
echo ""

read -p "ELASTIC_PASSWORD (leave blank for auto-generated): " ELASTIC_PASSWORD

if [ -n "$ELASTIC_PASSWORD" ]; then
    log_info "Updating Elasticsearch password..."
    vault_patch secret/transcendance/elastic ELASTIC_PASSWORD="$ELASTIC_PASSWORD" > /dev/null
    log_info "Elasticsearch password updated!"
else
    log_info "Keeping auto-generated Elasticsearch password"
fi

echo ""

# Summary
echo "========================================"
log_info "Secrets initialization complete!"
echo "========================================"
echo ""
log_info "Your secrets are now stored in Vault at:"
echo "  - secret/transcendance/auth"
echo "  - secret/transcendance/db"
echo "  - secret/transcendance/elastic"
echo "  - secret/transcendance/blockchain"
echo ""
log_warn "Remember to back up $KEYS_FILE securely!"
echo ""
