# HashiCorp Vault Production Configuration
# Documentation: https://developer.hashicorp.com/vault/docs/configuration

# Disable memory locking (required for Docker on some systems like WSL)
disable_mlock = true

# Cluster name for identification
cluster_name = "transcendance-vault"

# API and Cluster listener configuration
listener "tcp" {
  address         = "0.0.0.0:8200"
  cluster_address = "0.0.0.0:8201"
  
  # TLS Configuration - REQUIRED for production
  tls_cert_file = "/vault/tls/vault-cert.pem"
  tls_key_file  = "/vault/tls/vault-key.pem"
  
  # Optional: Require client certificates (mTLS)
  # tls_client_ca_file = "/vault/tls/ca-cert.pem"
  # tls_require_and_verify_client_cert = true
  
  # Disable TLS only for testing (NEVER in production)
  # tls_disable = true
}

# Storage Backend - Using file storage (simpler for single-node)
storage "file" {
  path = "/vault/data"
}

# Alternative: Raft storage (for HA clusters)
# storage "raft" {
#   path    = "/vault/data"
#   node_id = "vault-node-1"
#   
#   # For HA cluster, add retry_join blocks for other nodes:
#   # retry_join {
#   #   leader_api_addr = "https://vault-node-2:8200"
#   #   leader_ca_cert_file = "/vault/tls/ca-cert.pem"
#   # }
# }

# API address for Vault to advertise
api_addr = "https://vault:8200"

# UI Configuration
ui = true

# Telemetry for monitoring (optional but recommended)
telemetry {
  prometheus_retention_time = "30s"
  disable_hostname          = true
}

# Logging
log_level = "info"
log_format = "json"

# Default lease durations
default_lease_ttl = "768h"   # 32 days
max_lease_ttl     = "8760h"  # 365 days
