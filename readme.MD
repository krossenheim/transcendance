```markdown
Verify services in browser or API

Prometheus: http://localhost:9090 (or curl http://localhost:9090/api/v1/targets)
Grafana: http://localhost:3000 (default admin/admin, change immediately)
Alertmanager: http://localhost:9093
cAdvisor: http://localhost:8080
vault: http://localhost:8200/ui/vault/secrets

sudo docker compose -f ./srcs/monitoring/docker-compose.yml up -d

sudo docker compose -f ./srcs/compose.yml exec elasticsearch /usr/share/elasticsearch/bin/elasticsearch-service-tokens create elastic/kibana default

sudo docker compose -f ./srcs/compose.yml exec elasticsearch /usr/share/elasticsearch/bin/elasticsearch-service-tokens revoke elastic/kibana default


http://localhost:9090/query
http://localhost:3000/?orgId=1
http://localhost:9093/#/alerts
http://localhost:8080/containers/
http://localhost:9200/
```

**Vault (development) — quick notes**
- **Bootstrap:** a helper script exists at `srcs/vault/bootstrap_vault_dev.sh` that enables KV v2 and can populate example secrets and a demo policy for local development.
- **Dev UI / API:** Vault UI is available at `http://localhost:8200/ui` when the compose stack is running. The API is at `http://localhost:8200`.
- **Dev token caution:** for convenience the dev bootstrap flow prints or writes a temporary token. Do NOT commit real tokens or long-lived credentials to the repository. For local experiments a short-lived scoped token with the `read-transcendance` policy is sufficient.
- **Where secrets live:** this project stores secrets (KV v2) under paths like `secret/data/transcendance/nginx`, `.../elastic`, `.../auth`, and `.../kibana`.
- **Read a secret (example):**

```bash
# from a machine with network access to the compose network
export VAULT_ADDR=http://localhost:8200
export VAULT_TOKEN="$(cat srcs/globals.env | grep ^VAULT_TOKEN= | cut -d'=' -f2- || true)"
curl -sS -H "X-Vault-Token: $VAULT_TOKEN" "$VAULT_ADDR/v1/secret/data/transcendance/elastic" | jq .
```

- **Recommended production approach:** use Vault Agent, AppRole, Kubernetes Auth, or another secure auth method to provide short-lived tokens to services instead of placing a token in `srcs/globals.env`.

**ModSecurity / WAF notes**
- **How it is integrated:** the nginx image in this repo is built with a dynamic ModSecurity connector module. The module file is included in the built image and loaded by the nginx entrypoint templates. Audit logs are written to `/var/log/modsecurity/modsec_audit.log` inside the `nginx` container.
- **Toggle behavior:** the WAF rule engine is controlled with `MODSEC_RULE_ENGINE` (commonly set in `srcs/globals.env`). Typical values:
  - `DetectionOnly` — log detections but do not block (safe for development)
  - `On` — block matching requests

- **Test detection quickly:**

```bash
# trigger a simple example rule (CRS example rule id 910100)
curl -v "http://localhost/" -H 'User-Agent: () { :; }; echo; /bin/cat /etc/passwd'

# tail the audit log inside the running nginx container
NGINX=$(docker compose -f srcs/compose.yml ps -q nginx)
docker exec -it $NGINX tail -n 200 /var/log/modsecurity/modsec_audit.log
```

- **Build / rebuild:** building the ModSecurity-enabled nginx can take several minutes. Use the two-step workflow described above (`make build` then `make all`) to avoid repeated long builds while iterating.

If you want, I can also add a short `VAULT.md` or expand `readme.MD` with a step-by-step `vault-bootstrap` example and a `vault-migrate` Make target to automate moving env values into Vault. Say the word and I'll implement it.

Recommended two-step workflow for WAF & Vault development
--------------------------------------------------------
When iterating on the project — especially when building the ModSecurity-enabled nginx image — it's faster and safer to split the work into two steps.

- Step 1 — build images (can be long; compiles ModSecurity):

  ```bash
  # builds project images (may take several minutes)
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
- The ModSecurity/nginx build is time-consuming and can fail for reasons you want to inspect; running `make build` first lets you fix build errors before starting containers.
- If a build fails, you avoid partially started containers and side effects, making debugging simpler.
- After the first successful build, you can iterate quickly with `make all` or `docker compose up -d` because images are already present locally.
Verify services in browser or API

Prometheus: http://localhost:9090 (or curl http://localhost:9090/api/v1/targets)
Grafana: http://localhost:3000 (default admin/admin, change immediately)
Alertmanager: http://localhost:9093
cAdvisor: http://localhost:8080


sudo docker compose -f ./srcs/monitoring/docker-compose.yml up -d

sudo docker compose -f ./srcs/compose.yml exec elasticsearch /usr/share/elasticsearch/bin/elasticsearch-service-tokens create elastic/kibana default

sudo docker compose -f ./srcs/compose.yml exec elasticsearch /usr/share/elasticsearch/bin/elasticsearch-service-tokens revoke elastic/kibana default


http://localhost:9090/query
http://localhost:3000/?orgId=1
http://localhost:9093/#/alerts
http://localhost:8080/containers/
http://localhost:9200/