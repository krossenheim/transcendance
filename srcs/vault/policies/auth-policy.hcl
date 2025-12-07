# Policies for Vault services
# These are also embedded in vault-manage.sh but can be loaded separately

# Auth service - read only access to auth secrets
path "secret/data/transcendance/auth" {
  capabilities = ["read"]
}
