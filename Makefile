# Base directories
PROJECT_ROOT := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
OUTPUT_FILES_DIR := $(PROJECT_ROOT)out
SOURCES_DIR := $(PROJECT_ROOT)srcs
VOLUMES_DIR := $(OUTPUT_FILES_DIR)/transcendance_volumes/

# Docker compose & env
PATH_TO_COMPOSE_ENV_FILE := $(SOURCES_DIR)/globals.env
PATH_TO_COMPOSE := $(SOURCES_DIR)/compose.yml
PATH_TO_MONITORING_COMPOSE := $(SOURCES_DIR)/monitoring/docker-compose.yml

# Base image
PATH_TO_BASE_IMAGE := $(SOURCES_DIR)/nodejs_base_image/Dockerfile
BASE_IMAGE_TAG := nodejs_base_image:1.0

# Network
TR_NETWORK_SUBNET = 172.18.0.0/16
NODEJS_BASE_IMAGE_DIR =$(PROJECT_ROOT)srcs/nodejs_base_image

# React build directory for npm arguments
REACT_DIR := $(SOURCES_DIR)/nginx/react_source
# Node.js memory tuning (override with: make NODE_MAX_OLD_SPACE=6144 build)
NODE_MAX_OLD_SPACE ?= 4096
$(NAME): all

all: check-deps ensure_npx down build
all: check-deps ensure_npx down build ensure_network
	VOLUMES_DIR=${VOLUMES_DIR} docker compose -f "$(PATH_TO_COMPOSE)" -f "$(PATH_TO_MONITORING_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" up -d --remove-orphans

ensure_npx:
	@if ! [ -x "$$(command -v npx)" ]; then \
		echo "Attempting to install npx." >&2; \
		npm install typescript @types/node --save-dev; \
		exit 1; \
	fi

dnginx:
	docker exec -it nginx cat /var/log/nginx/error.log

down:
	VOLUMES_DIR=${VOLUMES_DIR} docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" down --timeout 1

# Ensure the shared external network exists before bringing services up
ensure_network:
	@docker network inspect transcendance_network >/dev/null 2>&1 || \
		docker network create --driver bridge --subnet ${TR_NETWORK_SUBNET} \
			--label com.docker.compose.network=transcendance_network \
			--label com.docker.compose.project=srcs transcendance_network

# Monitoring helpers
up-monitoring:
	VOLUMES_DIR=${VOLUMES_DIR} docker compose -f "$(PATH_TO_MONITORING_COMPOSE)" up -d --remove-orphans

down-monitoring:
	VOLUMES_DIR=${VOLUMES_DIR} docker compose -f "$(PATH_TO_MONITORING_COMPOSE)" down --timeout 1

up-all:
	VOLUMES_DIR=${VOLUMES_DIR} docker compose -f "$(PATH_TO_COMPOSE)" -f "$(PATH_TO_MONITORING_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" up -d --remove-orphans

down-all:
	VOLUMES_DIR=${VOLUMES_DIR} docker compose -f "$(PATH_TO_COMPOSE)" -f "$(PATH_TO_MONITORING_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" down --timeout 1

RED := \033[0;31m
YELLOW := \033[1;33m
NC := \033[0m  # No Color (reset)

debug:
	@echo -e "$(RED)DELETING DATABASE!!!!!!!! ! @ !!$(NC)"
	@echo -e "$(YELLOW)rm $(VOLUMES_DIR)users.db$(NC)"
	@echo -e "$(RED)Actually removing: rm $(VOLUMES_DIR)users.db$(NC)"
	rm -f $(VOLUMES_DIR)users.db

build: create_shared_volume_folder compile_ts_to_cjs build_base_nodejs build_react debug pass_global_envs_test_to_nodejs_containers
	VOLUMES_DIR=${VOLUMES_DIR} docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" build

build_base_nodejs:
	docker build -f "$(PATH_TO_BASE_IMAGE)" -t $(BASE_IMAGE_TAG) "$(NODEJS_BASE_IMAGE_DIR)"

build_react:
	npm install --prefix $(REACT_DIR)
	NODE_OPTIONS=--max_old_space_size=$(NODE_MAX_OLD_SPACE) npm run build --prefix $(REACT_DIR)

vault-bootstrap:
	@echo "Starting Vault (dev) and bootstrapping..."
	VOLUMES_DIR=${VOLUMES_DIR} docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" up -d vault || true
	@printf "Waiting for Vault to be healthy..."
	@until curl -sSf http://127.0.0.1:8200/v1/sys/health >/dev/null 2>&1; do printf .; sleep 1; done; echo
	@docker cp srcs/vault/bootstrap_vault_dev.sh vault:/bootstrap_vault_dev.sh || true
	@docker exec vault sh -c "chmod +x /bootstrap_vault_dev.sh && VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN=root-token-for-dev /bootstrap_vault_dev.sh"
	@TOKEN=$$(docker exec vault sh -c "VAULT_ADDR=http://127.0.0.1:8200 VAULT_TOKEN=root-token-for-dev vault token create -policy=nginx-policy -field=token"); \
	printf "VAULT token: $$TOKEN\n"; \
	if grep -q '^VAULT_TOKEN=' srcs/globals.env >/dev/null 2>&1; then \
		sed -i "s#^VAULT_TOKEN=.*#VAULT_TOKEN=$$TOKEN#" srcs/globals.env; \
	else \
		echo "VAULT_TOKEN=$$TOKEN" >> srcs/globals.env; \
	fi; \
	# Enable USE_VAULT for local testing
	sed -i 's#^USE_VAULT=.*#USE_VAULT=true#' srcs/globals.env || true; \
	echo "Wrote token to srcs/globals.env (dev-only)."

vault-down:
	@echo "Stopping and removing Vault (dev) container..."
	VOLUMES_DIR=${VOLUMES_DIR} docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" stop vault || true
	VOLUMES_DIR=${VOLUMES_DIR} docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" rm -f vault || true
	@echo "Removing VAULT_TOKEN from $(PATH_TO_COMPOSE_ENV_FILE) and disabling USE_VAULT"
	@sed -i '/^VAULT_TOKEN=/d' "$(PATH_TO_COMPOSE_ENV_FILE)" || true
	@sed -i 's/^USE_VAULT=.*/USE_VAULT=false/' "$(PATH_TO_COMPOSE_ENV_FILE)" || echo "USE_VAULT=false" >> "$(PATH_TO_COMPOSE_ENV_FILE)"
	@echo "Vault stopped and token removed (dev-only)."

check-deps:
	@echo "Checking system dependencies (node, npm, docker, docker compose)..."
	@if ! command -v node >/dev/null 2>&1; then \
		echo "Missing nodejs. Install with: sudo apt install nodejs" >&2; exit 1; \
	fi
	@if ! command -v npm >/dev/null 2>&1; then \
		echo "Missing npm. Install with: sudo apt install npm" >&2; exit 1; \
	fi
	@if ! command -v docker >/dev/null 2>&1; then \
		echo "Missing docker. Follow installation: sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin" >&2; exit 1; \
	fi
	@docker compose version >/dev/null 2>&1 || { echo "Missing docker compose plugin. Install with: sudo apt install docker-compose-plugin" >&2; exit 1; }
	@echo "All required system dependencies present."

print_config: create_shared_volume_folder
	VOLUMES_DIR=${VOLUMES_DIR} docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" config

pass_global_envs_test_to_nodejs_containers:
	@echo "Generating process.env checks from $(PATH_TO_COMPOSE_ENV_FILE)"
	@echo "#!/bin/sh" > ${NODEJS_BASE_IMAGE_DIR}/appservice/check_global_envs.sh
	@echo "set -ex" >> ${NODEJS_BASE_IMAGE_DIR}/appservice/check_global_envs.sh
	@grep -v '^\s*#' $(PATH_TO_COMPOSE_ENV_FILE) | grep -v '^\s*$$' | \
		awk -F= '{print "if [ -z \"$${" $$1 "}\" ]; then echo \"ERROR: " $$1 " is not set\" >&2; exit 1; fi"}' \
		>> ${NODEJS_BASE_IMAGE_DIR}/appservice/check_global_envs.sh

install_nodejs:
	@if ! node -v >/dev/null 2>&1; then \
		if ! grep -qi 'debian\|ubuntu' /etc/os-release; then \
			echo "nodejs needs to be installed."; \
			exit 1; \
		fi; \
		curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -; \
		sudo apt install -y nodejs; \
	fi

npm_install_tsc:
	@if ! npm list typescript >/dev/null 2>&1; then \
		npm install --save-dev typescript @types/node --prefix ${PROJECT_ROOT}; \
		npm install; \
	fi


ensure_tsc: install_nodejs npm_install_tsc

CONTAINERS := auth chat db hub pong users

# Limit parallel TypeScript compilations to reduce peak memory use (override with TSC_JOBS=N)
TSC_JOBS ?= 2

compile_ts_to_cjs: ensure_tsc
	@echo "Compiling all TS projects..."
	@$(MAKE) -j $(TSC_JOBS) $(CONTAINERS)

$(CONTAINERS):
	@echo "Compiling $@..."
	@npx tsc --project srcs/$@/tsconfig.json || (echo "TypeScript compilation failed for $@" >&2; exit 1)

create_shared_volume_folder:
	if [ ! -d "$(VOLUMES_DIR)" ]; then \
		mkdir -p "$(VOLUMES_DIR)"; \
	fi

clean: down
	VOLUMES_DIR=${VOLUMES_DIR} docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" down --volumes --rmi all --remove-orphans
	rm -rf "$(VOLUMES_DIR)"

babylon: build_react
	@echo "Starting containers..."
	@VOLUMES_DIR=${VOLUMES_DIR} docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" up -d nginx || true
	@sleep 3
	@echo "Creating directories in nginx container..."
	@docker exec nginx mkdir -p /var/www/html/react_dist
	@echo "Copying static files..."
	@docker cp $(PROJECT_ROOT)srcs/nginx/staticfiles/. nginx:/var/www/html
	@docker cp $(PROJECT_ROOT)srcs/nginx/react_source/dist/. nginx:/var/www/html/react_dist

fclean: clean
	rm -rf "$(OUTPUT_FILES_DIR)"
	docker volume prune -f
	docker image prune -a -f

list:
	docker ps -a

.PHONY: up down build all re clean list check-deps $(CONTAINERS) up-monitoring down-monitoring up-all down-all
