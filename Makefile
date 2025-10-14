# Base directories
PROJECT_ROOT := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
OUTPUT_FILES_DIR := $(PROJECT_ROOT)out
SOURCES_DIR := $(PROJECT_ROOT)srcs
VOLUMES_DIR := $(OUTPUT_FILES_DIR)/transcendance_volumes/

# Docker compose & env
PATH_TO_COMPOSE_ENV_FILE := $(SOURCES_DIR)/globals.env
PATH_TO_COMPOSE := $(SOURCES_DIR)/compose.yml

# Base image
PATH_TO_BASE_IMAGE := $(SOURCES_DIR)/nodejs_base_image/Dockerfile
BASE_IMAGE_TAG := nodejs_base_image:1.0

# Network
TR_NETWORK_SUBNET = 172.18.0.0/16
NODEJS_BASE_IMAGE_DIR =$(PROJECT_ROOT)srcs/nodejs_base_image

# React build directory for npm arguments
REACT_DIR := $(SOURCES_DIR)/nginx/react_source
$(NAME): all


all: ensure_npx down build
	VOLUMES_DIR=${VOLUMES_DIR} docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" up -d --remove-orphans

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

RED := \033[0;31m
YELLOW := \033[1;33m
NC := \033[0m  # No Color (reset)


debug:
	@echo -e "$(RED)DELETING DATABASE!!!!!!!! ! @ !!$(NC)"
	@echo -e "$(YELLOW)rm $(VOLUMES_DIR)users.db$(NC)"
	@echo -e "$(RED)Actually removing: rm $(VOLUMES_DIR)users.db$(NC)"
	rm -f $(VOLUMES_DIR)users.db

build: build_react debug pass_global_envs_test_to_nodejs_containers compile_ts_to_cjs build_base_nodejs create_shared_volume_folder
	VOLUMES_DIR=${VOLUMES_DIR} docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" build 

build_base_nodejs:
	docker build -f "$(PATH_TO_BASE_IMAGE)" -t $(BASE_IMAGE_TAG) "$(NODEJS_BASE_IMAGE_DIR)"

build_react:
	npm install --prefix $(REACT_DIR)
	npm run build --prefix $(REACT_DIR)

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
	
compile_ts_to_cjs: ensure_tsc
	npx tsc --project srcs/auth/tsconfig.json
	npx tsc --project srcs/chat/tsconfig.json
	npx tsc --project srcs/db/tsconfig.json
	npx tsc --project srcs/hub/tsconfig.json
	npx tsc --project srcs/pong/tsconfig.json

create_shared_volume_folder:
	if [ ! -d "$(VOLUMES_DIR)" ]; then \
		mkdir -p "$(VOLUMES_DIR)"; \
	fi

clean: down
	VOLUMES_DIR=${VOLUMES_DIR} docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" down --volumes --rmi all --remove-orphans
	rm -rf "$(VOLUMES_DIR)"

babylon:
	 docker cp $(PROJECT_ROOT)srcs/nginx/staticfiles/. nginx:/var/www/html

fclean: clean
	rm -rf "$(OUTPUT_FILES_DIR)"
	docker volume prune -f
	docker image prune -a -f

list:
	docker ps -a

.PHONY: up down build all re clean list
