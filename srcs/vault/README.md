# Vault Production Setup

This directory contains the production configuration for HashiCorp Vault.

## Directory Structure

```
vault/
├── config/
│   └── vault.hcl           # Vault server configuration
├── policies/
│   ├── app-policy.hcl      # Full read access to all secrets
│   ├── auth-policy.hcl     # Auth service secrets
│   ├── db-policy.hcl       # Database service secrets
│   └── elastic-policy.hcl  # Elasticsearch secrets
├── tls/
│   ├── vault-cert.pem      # Server certificate (generated)
│   ├── vault-key.pem       # Server private key (generated)
│   └── ca-cert.pem         # CA certificate (generated)
├── docker-compose.prod.yml # Production compose file
├── generate-tls.sh         # TLS certificate generator
├── vault-manage.sh         # Init/unseal/bootstrap script
└── .gitignore              # Protects sensitive files
```

## Quick Start (Production)

### 1. Generate TLS Certificates

```bash
cd srcs/vault
chmod +x generate-tls.sh
./generate-tls.sh
```

For production, replace the self-signed certs with certificates from a trusted CA.

### 2. Start Vault

```bash
docker compose -f docker-compose.prod.yml up -d
```

### 3. Initialize and Unseal Vault (First Time Only)

```bash
chmod +x vault-manage.sh
./vault-manage.sh init
```

This will:
- Initialize Vault with 5 key shares (3 required to unseal)
- Save keys to `.vault-keys.json` (BACK THIS UP IMMEDIATELY!)
- Unseal Vault
- Bootstrap secrets and policies
- Create service tokens in `.tokens/`

### 4. On Subsequent Restarts

Vault seals itself when restarted. You must unseal it:

```bash
./vault-manage.sh unseal
```

## Security Notes

### Critical Files to Protect

| File | Description | Action |
|------|-------------|--------|
| `.vault-keys.json` | Unseal keys + root token | Backup securely, delete from server |
| `.tokens/*.token` | Service tokens | Distribute to services securely |
| `tls/*-key.pem` | TLS private keys | Protect file permissions |

### Unseal Key Management

The `vault-manage.sh` script stores all keys in one file for convenience. In production:

1. **Split the keys**: Give each key share to a different trusted person
2. **Use auto-unseal**: Configure AWS KMS, Azure Key Vault, or GCP KMS
3. **Delete local keys**: After backing up, remove `.vault-keys.json` from the server

### Root Token

The root token has unlimited access. After initial setup:

1. Create admin users/tokens with limited policies
2. Revoke the root token: `vault token revoke <root-token>`
3. Generate a new root token only when needed using unseal keys

## Secrets Structure

```
secret/transcendance/
├── auth/
│   ├── JWT_SECRET
│   ├── GITHUB_CLIENT_ID
│   └── GITHUB_CLIENT_SECRET
├── db/
│   ├── TOKEN_SECRET_KEY
│   ├── TOTP_MASTER_KEY
│   └── DB_PASSWORD
├── elastic/
│   └── ELASTIC_PASSWORD
└── blockchain/
    └── PRIVATE_KEY
```

## Service Integration

Services can retrieve secrets using:

### Option 1: Token-based (Simple)
```bash
export VAULT_ADDR="https://vault:8200"
export VAULT_TOKEN="$(cat /run/secrets/vault-token)"
vault kv get -format=json secret/transcendance/auth | jq -r '.data.data'
```

### Option 2: AppRole (Recommended for Production)
```bash
# Get role-id and secret-id (one-time setup)
ROLE_ID=$(vault read -field=role_id auth/approle/role/auth/role-id)
SECRET_ID=$(vault write -field=secret_id -f auth/approle/role/auth/secret-id)

# Login and get token
TOKEN=$(vault write -field=token auth/approle/login role_id=$ROLE_ID secret_id=$SECRET_ID)

# Use token to read secrets
VAULT_TOKEN=$TOKEN vault kv get secret/transcendance/auth
```

## Comparison: Dev vs Production

| Feature | Dev Mode | Production |
|---------|----------|------------|
| Storage | In-memory (lost on restart) | Raft/File (persistent) |
| Unsealing | Auto (insecure) | Manual or auto-unseal |
| TLS | Disabled | Required |
| Root Token | Known (`root-token-for-dev`) | Generated, should be revoked |
| Data Persistence | No | Yes (encrypted at rest) |

## Troubleshooting

### Vault is sealed after restart
```bash
./vault-manage.sh unseal
```

### Lost unseal keys
If you lost `.vault-keys.json` and have no backup, your data is **permanently lost**. You must:
1. Delete the vault data volume
2. Reinitialize Vault
3. Re-populate all secrets

### Check Vault status
```bash
./vault-manage.sh status
# or
docker exec transcendance-vault vault status
```

### View audit logs
```bash
docker logs transcendance-vault
```
