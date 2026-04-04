PROJECT_ROOT := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
OUTPUT_FILES_DIR := $(PROJECT_ROOT)out
SOURCES_DIR := $(PROJECT_ROOT)containers
VOLUMES_DIR := $(OUTPUT_FILES_DIR)/volumes/

PATH_TO_COMPOSE_ENV_FILE := globals.env
PATH_TO_COMPOSE_SECRETS_FILE := secrets.env
PATH_TO_COMPOSE := compose.yml
COMPOSE_PROGRESS ?= auto

TR_NETWORK_SUBNET = 172.18.0.0/16


DC_ENV := VOLUMES_DIR=${VOLUMES_DIR}

REACT_DIR := $(SOURCES_DIR)/nginx/react_source
NODE_MAX_OLD_SPACE ?= 4096
$(NAME): all

all: ensure_env ensure_volumes check-deps down build ensure_network
	$(DC_ENV) docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" --env-file "$(PATH_TO_COMPOSE_SECRETS_FILE)" up -d --remove-orphans

ensure_env:
	@if [ ! -f "$(PATH_TO_COMPOSE_ENV_FILE)" ]; then \
		echo "Error: Environment file '$(PATH_TO_COMPOSE_ENV_FILE)' not found."; \
		exit 1; \
	fi

	@if [ ! -f "$(PATH_TO_COMPOSE_SECRETS_FILE)" ]; then \
		echo "Error: Secrets file '$(PATH_TO_COMPOSE_SECRETS_FILE)' not found."; \
		exit 1; \
	fi

ensure_volumes:
	mkdir -p "$(VOLUMES_DIR)"/database

dnginx:
	docker exec -it nginx cat /var/log/nginx/error.log

down:
	@# Automatically bring down monitoring if any monitoring container is running
	@if docker ps -q --filter "name=prometheus" --filter "name=grafana" --filter "name=alertmanager" 2>/dev/null | grep -q .; then \
		echo "Monitoring containers detected, bringing down everything..."; \
		$(DC_ENV) docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" down --timeout 1 2>/dev/null; \
	else \
		$(DC_ENV) docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" down --timeout 1 2>/dev/null; \
	fi
	@# Clean up the network if it exists and is unused
	@docker network rm transcendance_network 2>/dev/null || true

ensure_network:
	@docker network inspect transcendance_network >/dev/null 2>&1 || \
		docker network create --driver bridge --subnet ${TR_NETWORK_SUBNET} \
			--label com.docker.compose.network=transcendance_network \
			--label com.docker.compose.project=transcendance transcendance_network

up-all:
	$(DC_ENV) docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" up -d --remove-orphans

down-all:
	$(DC_ENV) docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" down --timeout 1

RED := \033[0;31m
YELLOW := \033[1;33m
NC := \033[0m

debug:
	@echo -e "=============================="
	@echo -e "$(RED)DELETING DATABASE!!!!!!!! ! @ !!$(NC)"
	@echo -e "$(YELLOW)rm $(VOLUMES_DIR)users.db$(NC)"
	@echo -e "$(RED)Actually removing: rm $(VOLUMES_DIR)users.db$(NC)"
	rm -rf $(VOLUMES_DIR)database/users.db
	rm -rf $(VOLUMES_DIR)database/pfps

HARDHAT_IMAGE_TAG := hardhat:local
EXPLORER_IMAGE_TAG := blockchain-explorer:local
BLOCKCHAIN_DIR := $(SOURCES_DIR)/blockchain

rebuild:
	$(DC_ENV) docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" --env-file "$(PATH_TO_COMPOSE_SECRETS_FILE)" up -d --build --no-deps ${s}

build: create_shared_volume_folder debug build_hardhat_if_needed build_explorer_if_needed build-cli
	$(DC_ENV) docker compose --progress=$(COMPOSE_PROGRESS) -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" --env-file "$(PATH_TO_COMPOSE_SECRETS_FILE)" build db auth chat hub pong users nginx

build-cli:
	@echo "Building pong-cli..."
	$(MAKE) -C $(SOURCES_DIR)/CLI

build_hardhat_if_needed:
	@if ! docker image inspect $(HARDHAT_IMAGE_TAG) >/dev/null 2>&1; then \
		echo "Building Hardhat image (first time)..."; \
		docker compose --progress=$(COMPOSE_PROGRESS) -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" --env-file "$(PATH_TO_COMPOSE_SECRETS_FILE)" build hardhat; \
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
	docker compose --progress=$(COMPOSE_PROGRESS) -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" --env-file "$(PATH_TO_COMPOSE_SECRETS_FILE)" build hardhat

build-hardhat-plain:
	@echo "Force rebuilding Hardhat image (plain output)..."
	COMPOSE_PROGRESS=plain $(MAKE) build-hardhat

build-explorer:
	@echo "Force rebuilding Block Explorer image..."
	docker build -f "$(BLOCKCHAIN_DIR)/explorer/Dockerfile" -t $(EXPLORER_IMAGE_TAG) "$(BLOCKCHAIN_DIR)/explorer"

build_react:
	npm install --prefix $(REACT_DIR)
	NODE_OPTIONS=--max_old_space_size=$(NODE_MAX_OLD_SPACE) npm run build --prefix $(REACT_DIR)

check-deps: check-system-deps check-npm-deps
	@echo "All required dependencies present."

check-system-deps:
	@echo "Checking system dependencies (docker, docker compose)..."
	@if ! command -v docker >/dev/null 2>&1; then \
		echo "Docker not found. Installing Docker..."; \
		sudo apt update && sudo apt install -y ca-certificates curl && \
		sudo install -m 0755 -d /etc/apt/keyrings && \
		sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc && \
		sudo chmod a+r /etc/apt/keyrings/docker.asc && \
		echo "deb [arch=$$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $$(. /etc/os-release && echo $$VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null && \
		sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin && \
		sudo usermod -aG docker $$USER && \
		echo "Docker installed. You may need to log out and back in for group changes to take effect."; \
	fi
	@docker compose version >/dev/null 2>&1 || { \
		echo "Docker compose plugin not found. Installing..."; \
		sudo apt update && sudo apt install -y docker-compose-plugin; \
	}

check-npm-deps:
	@echo "Checking npm dependencies..."
	@if ! command -v node >/dev/null 2>&1; then \
		echo "Node.js not found. Installing Node.js 20.x..."; \
		curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && \
		sudo apt-get install -y nodejs; \
	elif [ $$(node -e 'console.log(parseInt(process.versions.node))') -lt 20 ]; then \
		echo "Node.js $$(node --version) is too old (need >= 20). Upgrading..."; \
		curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && \
		sudo apt-get install -y nodejs; \
	fi
	@if [ ! -d "$(PROJECT_ROOT)node_modules" ]; then \
		echo "Installing root npm dependencies..."; \
		npm install --prefix "$(PROJECT_ROOT)"; \
	fi
	@if [ ! -d "$(BLOCKCHAIN_DIR)/node_modules" ]; then \
		echo "Installing blockchain npm dependencies..."; \
		npm install --prefix "$(BLOCKCHAIN_DIR)" --legacy-peer-deps; \
		echo "Applying safe audit fixes for blockchain..."; \
		cd "$(BLOCKCHAIN_DIR)" && npm audit fix --legacy-peer-deps 2>/dev/null || true; \
	fi
	@if [ ! -d "$(PROJECT_ROOT)shared/node_modules" ]; then \
		echo "Installing shared npm dependencies..."; \
		npm install --prefix "$(PROJECT_ROOT)shared"; \
	fi

print_config: create_shared_volume_folder
	$(DC_ENV) docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" config

create_shared_volume_folder:
	@if [ ! -d "$(VOLUMES_DIR)" ]; then \
		mkdir -p "$(VOLUMES_DIR)"; \
	fi

clean: down
	$(DC_ENV) docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" down --volumes --rmi all --remove-orphans
	rm -rf "$(VOLUMES_DIR)"

fclean: clean
	rm -rf "$(OUTPUT_FILES_DIR)"
	rm -rf "$(PROJECT_ROOT)static/react_dist/assets"
	# Remove VM-side node_modules and lock files installed by check-npm-deps / build_react
	find "$(PROJECT_ROOT)" -maxdepth 3 -name node_modules -type d -exec rm -rf {} +
	find "$(PROJECT_ROOT)" -maxdepth 3 -name package-lock.json -not -path '*/blockchain/*' -delete
	# Remove all service containers by name
	for c in $(NGINX_NAME) $(HUB_NAME) $(CHATROOM_NAME) $(DATABASE_NAME) $(AUTH_NAME) $(PONG_NAME) $(USERS_NAME) hardhat blockchain-explorer; do \
	    docker rm -f $$c 2>/dev/null || true; \
	done
	docker builder prune -af
	docker volume prune -f
	docker image prune -a -f
	docker volume prune -f
	docker image prune -a -f

re-front:
	$(DC_ENV) docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" up -d --build --no-deps nginx

list:
	docker ps -a

fix_deps:
	npm install -D syncpack
	npx syncpack fix

.PHONY: all dnginx down ensure_network build build-cli build-hardhat build-explorer build_react check-deps check-system-deps check-npm-deps print_config create_shared_volume_folder clean fclean list build_hardhat_if_needed build_explorer_if_needed