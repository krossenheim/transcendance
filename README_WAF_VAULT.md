Short README — WAF (ModSecurity) + Vault proof-of-concept

Purpose
- Adds a build-from-source ModSecurity-enabled nginx image and a Vault (dev) service
  to the project's compose so you can test a WAF and secrets management flow.

Quick start (dev)
Prerequisites: `docker`, `docker compose` plugin, `make`, and optionally the `vault` CLI for manual bootstrap inspection.

1. Build images (ModSecurity compilation may take several minutes):

   sudo make build

2. Bootstrap Vault (dev) and write a test token into `srcs/globals.env` (dev-only convenience):

   sudo make vault-bootstrap

3. Bring the stack up (or only nginx):

   sudo make all

   # or start only nginx (useful while iterating)
   VOLUMES_DIR=out/transcendance_volumes docker compose -f srcs/compose.yml --env-file srcs/globals.env up -d nginx

Testing the WAF (detection-only)
- The nginx image is built with ModSecurity and a small example CRS rule in `srcs/nginx/modsecurity/crs/`.
- The WAF is set to `DetectionOnly` by default. To trigger the example rule and inspect logs:

   docker exec -it nginx sh -c "curl -k 'https://localhost/?q=union%20select' || true; sleep 1; tail -n50 /var/log/modsecurity/modsec_audit.log"

- There is a helper script `srcs/nginx/test_modsec_request.sh` that runs the same sequence.

Vault notes (dev)
- `srcs/compose.yml` now contains a `vault` service running in dev mode (not production-safe).
- `srcs/vault/bootstrap_vault_dev.sh` populates `secret/transcendance/nginx` and creates a policy `nginx-policy`.
- `sudo make vault-bootstrap` starts Vault (if needed), runs the bootstrap inside the container, creates a token and writes it into `srcs/globals.env` as `VAULT_TOKEN=...` and sets `USE_VAULT=true` (dev-only convenience).
- To remove the token and stop Vault:

   sudo make vault-down

Integration with services
- `srcs/nodejs_base_image/appservice/check_global_envs.sh` was updated to optionally fetch secrets from Vault when `USE_VAULT=true` and `VAULT_TOKEN` is present. It reads `secret/data/transcendance/nginx` (KV v2) and exports `NGINX_API_KEY`, `DATABASE_PASSWORD`, `ELASTIC_PASSWORD` if present.

Security and production guidance
- The Vault dev mode and writing tokens into `srcs/globals.env` are for development and testing only. Do not use these in production.
- For production use:
  - Run Vault in non-dev mode with a secure storage backend and TLS.
  - Use AppRole, Kubernetes auth, or Vault Agent to retrieve short-lived credentials.
  - Tune ModSecurity rules starting in `DetectionOnly` mode and move to `On` (blocking) after careful tuning.

Files of interest
- `srcs/nginx/Dockerfile.modsec.build` — multi-stage Dockerfile that builds libmodsecurity and the nginx connector from source and produces a runtime image.
- `srcs/nginx/modsecurity/` — ModSecurity template + small CRS subset.
- `srcs/compose.yml` — main compose file now builds the modsecurity-enabled nginx and includes the Vault dev service.
- `srcs/vault/bootstrap_vault_dev.sh` — bootstraps dev secrets and policy.
- `srcs/nginx/test_modsec_request.sh` — helper test script to trigger detection and show audit logs.

If you'd like I can:
- Add a `make quick` target to run a faster dev stack (no ModSecurity rebuild).
- Replace the dev-token write behavior to instead write tokens to `.secrets/nginx.token` with tighter file permissions.

-- End

Recommended two-step workflow
--------------------------------
When iterating, it's often faster and safer to separate image builds from bringing the stack up:

- Step 1 — build images (long; compiles ModSecurity):

   ```bash
   # builds all project images (may take several minutes)
   sudo make build
   ```

- Step 2 — start services (fast after build):

   ```bash
   # start the full stack (or run only nginx during iteration)
   sudo make all
   # or start only nginx (no rebuild):
   VOLUMES_DIR=out/transcendance_volumes docker compose -f srcs/compose.yml --env-file srcs/globals.env up -d nginx
   ```

Why split the steps?
- The ModSecurity/nginx build is time-consuming and sometimes fails with build errors; running `make build` first lets you inspect and fix build problems before containers start.
- If a build fails, you avoid partially started containers and side effects, making debugging simpler.
- After the first successful build, you can iterate quickly with `make all` or compose `up -d` because the images are already present locally.

