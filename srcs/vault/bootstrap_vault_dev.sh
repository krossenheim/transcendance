#!/bin/sh
set -ex

# Bootstrap script for Vault dev to create a KV v2 path and a limited policy/token
# Requires Vault dev server running and VAULT_ADDR + VAULT_TOKEN set in env, e.g.:
# export VAULT_ADDR=http://127.0.0.1:8200
# export VAULT_TOKEN=root-token-for-dev

if [ -z "${VAULT_ADDR}" ]; then echo "VAULT_ADDR not set" >&2; exit 1; fi
if [ -z "${VAULT_TOKEN}" ]; then echo "VAULT_TOKEN not set" >&2; exit 1; fi

export VAULT_ADDR
export VAULT_TOKEN

# Enable KV v2 at secret/ if not already enabled
vault secrets enable -path=secret -version=2 kv || true

# Write example secrets for nginx and other services
vault kv put secret/transcendance/nginx NGINX_API_KEY="demo-nginx-key" DATABASE_PASSWORD="demo-db-pass" ELASTIC_PASSWORD="demo-elastic-pass"

# Create a policy allowing read to the nginx path
cat > nginx_policy.hcl <<'HCL'
path "secret/data/transcendance/nginx" {
  capabilities = ["read"]
}
HCL

vault policy write nginx-policy nginx_policy.hcl

echo "To create a token for nginx-policy, run:"
echo "  vault token create -policy=nginx-policy -field=token > nginx.token"
echo "This will save the new token into ./nginx.token"

echo "Bootstrap complete. Use the generated token to configure services (dev only)."