# Base directories
PROJECT_ROOT := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
OUTPUT_FILES_DIR := $(PROJECT_ROOT)out
SOURCES_DIR := $(PROJECT_ROOT)srcs
VOLUMES_DIR := $(OUTPUT_FILES_DIR)/transcendance_volumes/

# Docker compose & env
PATH_TO_COMPOSE_ENV_FILE := globals.env
PATH_TO_COMPOSE_SECRETS_FILE := secrets.env
PATH_TO_COMPOSE := compose.yml

# Network
TR_NETWORK_SUBNET = 172.18.0.0/16

# React build directory for npm arguments
REACT_DIR := $(SOURCES_DIR)/nginx/react_source
# Node.js memory tuning (override with: make NODE_MAX_OLD_SPACE=6144 build)
NODE_MAX_OLD_SPACE ?= 4096
$(NAME): all

all: ensure_env check-deps down build ensure_network
	VOLUMES_DIR=${VOLUMES_DIR} docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" --env-file "$(PATH_TO_COMPOSE_SECRETS_FILE)" up -d --remove-orphans

ensure_env:
	if [ ! -f "$(PATH_TO_COMPOSE_ENV_FILE)" ]; then \
		echo "Error: Environment file '$(PATH_TO_COMPOSE_ENV_FILE)' not found."; \
		exit 1; \
	fi

	if [ ! -f "$(PATH_TO_COMPOSE_SECRETS_FILE)" ]; then \
		echo "Error: Secrets file '$(PATH_TO_COMPOSE_SECRETS_FILE)' not found."; \
		exit 1; \
	fi

dnginx:
	docker exec -it nginx cat /var/log/nginx/error.log

down:
	@# Automatically bring down monitoring if any monitoring container is running
	@if docker ps -q --filter "name=prometheus" --filter "name=grafana" --filter "name=alertmanager" 2>/dev/null | grep -q .; then \
		echo "Monitoring containers detected, bringing down everything..."; \
		VOLUMES_DIR=${VOLUMES_DIR} docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" down --timeout 1; \
	else \
		VOLUMES_DIR=${VOLUMES_DIR} docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" down --timeout 1; \
	fi
	@# Clean up the network if it exists and is unused
	@docker network rm transcendance_network 2>/dev/null || true

# Ensure the shared external network exists before bringing services up
ensure_network:
	@docker network inspect transcendance_network >/dev/null 2>&1 || \
		docker network create --driver bridge --subnet ${TR_NETWORK_SUBNET} \
			--label com.docker.compose.network=transcendance_network \
			--label com.docker.compose.project=srcs transcendance_network

up-all:
	VOLUMES_DIR=${VOLUMES_DIR} docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" up -d --remove-orphans

down-all:
	VOLUMES_DIR=${VOLUMES_DIR} docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" down --timeout 1

RED := \033[0;31m
YELLOW := \033[1;33m
NC := \033[0m  # No Color (reset)

debug:
	@echo -e "$(RED)DELETING DATABASE!!!!!!!! ! @ !!$(NC)"
	@echo -e "$(YELLOW)rm $(VOLUMES_DIR)users.db$(NC)"
	@echo -e "$(RED)Actually removing: rm $(VOLUMES_DIR)users.db$(NC)"
	rm -f $(VOLUMES_DIR)users.db

# Hardhat image - only rebuild if not exists or forced with 'make build-hardhat'
HARDHAT_IMAGE_TAG := hardhat:local
EXPLORER_IMAGE_TAG := blockchain-explorer:local
BLOCKCHAIN_DIR := $(SOURCES_DIR)/blockchain

build: create_shared_volume_folder debug build_hardhat_if_needed build_explorer_if_needed
	VOLUMES_DIR=${VOLUMES_DIR} docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" build db auth chat hub pong users nginx

build_hardhat_if_needed:
	@if ! docker image inspect $(HARDHAT_IMAGE_TAG) >/dev/null 2>&1; then \
		echo "Building Hardhat image (first time)..."; \
		docker build -f "$(BLOCKCHAIN_DIR)/Dockerfile" -t $(HARDHAT_IMAGE_TAG) "$(BLOCKCHAIN_DIR)"; \
	else \
		echo "Hardhat image exists, skipping rebuild (use 'make build-hardhat' to force)"; \
	fi

build_explorer_if_needed:
	@if ! docker image inspect $(EXPLORER_IMAGE_TAG) >/dev/null 2>&1; then \
		echo "Building Block Explorer image (first time)..."; \
		docker build -f "$(BLOCKCHAIN_DIR)/explorer/Dockerfile" -t $(EXPLORER_IMAGE_TAG) "$(BLOCKCHAIN_DIR)/explorer"; \
	else \
		echo "Block Explorer image exists, skipping rebuild"; \
	fi

build-hardhat:
	@echo "Force rebuilding Hardhat image..."
	docker build -f "$(BLOCKCHAIN_DIR)/Dockerfile" -t $(HARDHAT_IMAGE_TAG) "$(BLOCKCHAIN_DIR)"

build-explorer:
	@echo "Force rebuilding Block Explorer image..."
	docker build -f "$(BLOCKCHAIN_DIR)/explorer/Dockerfile" -t $(EXPLORER_IMAGE_TAG) "$(BLOCKCHAIN_DIR)/explorer"

build_react:
	npm install --prefix $(REACT_DIR)
	NODE_OPTIONS=--max_old_space_size=$(NODE_MAX_OLD_SPACE) npm run build --prefix $(REACT_DIR)

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

create_shared_volume_folder:
	if [ ! -d "$(VOLUMES_DIR)" ]; then \
		mkdir -p "$(VOLUMES_DIR)"; \
	fi

clean: down
	VOLUMES_DIR=${VOLUMES_DIR} docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" down --volumes --rmi all --remove-orphans
	rm -rf "$(VOLUMES_DIR)"

fclean: clean
	rm -rf "$(OUTPUT_FILES_DIR)"
	docker volume prune -f
	docker image prune -a -f

list:
	docker ps -a

.PHONY: all dnginx down ensure_network build build-hardhat build-explorer build_react check-deps print_config create_shared_volume_folder clean fclean list build_hardhat_if_needed build_explorer_if_needed