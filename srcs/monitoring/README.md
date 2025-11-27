# Monitoring module (Prometheus + Grafana)

This folder contains a minimal monitoring stack scaffold using Prometheus, Alertmanager, Grafana, node-exporter and cAdvisor.

Quick start

1. From repository root run:

```bash
cd srcs/monitoring
docker compose up -d
```

2. Open services:
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3000 (user: `admin`, password: `admin` — change this!)
- cAdvisor: http://localhost:8080
- Alertmanager: http://localhost:9093

Notes and next steps

- Secure Grafana: change admin password and enable OAuth/LDAP in production.
- Integrate exporters: add Postgres exporter, Redis exporter etc. by adding scrape jobs in `prometheus/prometheus.yml` and services in `docker-compose.yml`.
- Configure Alertmanager receivers (email, Slack, PagerDuty) in `alertmanager/alertmanager.yml`.
- Data retention: adjust Prometheus flags (e.g., `--storage.tsdb.retention.time=15d`) in the `docker-compose.yml` command if you need longer retention.
- Consider using a remote write backend (Thanos, Cortex) for long-term storage.
