#!/bin/sh
set -ex

if [ "${USE_VAULT}" = "true" ] && [ -n "${VAULT_ADDR}" ] && [ -n "${VAULT_TOKEN}" ]; then
  echo "Fetching secrets from Vault at ${VAULT_ADDR}..."
  
  for i in $(seq 1 1); do
    if curl -sf "${VAULT_ADDR}/v1/sys/health" > /dev/null 2>&1; then
      echo "Vault is ready."
      break
    fi
    echo "Waiting for Vault... ($i/30)"
    sleep 1
  done
  
  VAULT_RESPONSE=$(curl -sS \
    -H "X-Vault-Token: ${VAULT_TOKEN}" \
    "${VAULT_ADDR}/v1/secret/data/transcendance/auth" 2>/dev/null || echo "{}")
  
  VAULT_GITHUB_CLIENT_ID=$(echo "${VAULT_RESPONSE}" | sed -n 's/.*"GITHUB_CLIENT_ID":"\([^"]*\)".*/\1/p')
  if [ -n "${VAULT_GITHUB_CLIENT_ID}" ]; then
    export GITHUB_CLIENT_ID="${VAULT_GITHUB_CLIENT_ID}"
    echo "Loaded GITHUB_CLIENT_ID from Vault."
  else
    echo "Warning: GITHUB_CLIENT_ID not found in Vault, using env if set."
  fi
  
  VAULT_GITHUB_CLIENT_SECRET=$(echo "${VAULT_RESPONSE}" | sed -n 's/.*"GITHUB_CLIENT_SECRET":"\([^"]*\)".*/\1/p')
  if [ -n "${VAULT_GITHUB_CLIENT_SECRET}" ]; then
    export GITHUB_CLIENT_SECRET="${VAULT_GITHUB_CLIENT_SECRET}"
    echo "Loaded GITHUB_CLIENT_SECRET from Vault."
  else
    echo "Warning: GITHUB_CLIENT_SECRET not found in Vault, using env if set."
  fi
else
  echo "Vault disabled or not configured, using environment variables."
fi

export GITHUB_CLIENT_ID="${GITHUB_CLIENT_ID:-}"
export GITHUB_CLIENT_SECRET="${GITHUB_CLIENT_SECRET:-}"
exec "$@"