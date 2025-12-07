# App policy - read access to all transcendance secrets
# Use this for services that need access to multiple secret paths
path "secret/data/transcendance/*" {
  capabilities = ["read"]
}
