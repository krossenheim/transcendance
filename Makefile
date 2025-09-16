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

$(NAME): all

all: build
	VOLUMES_DIR=${VOLUMES_DIR} docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" up -d

dnginx:
	docker exec -it nginx cat /var/log/nginx/error.log

re: down all

down:
	VOLUMES_DIR=${VOLUMES_DIR} docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" down --timeout 1

build: build_base_nodejs create_shared_volume_folder
	VOLUMES_DIR=${VOLUMES_DIR} docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" build

build_base_nodejs:
	docker build -f "$(PATH_TO_BASE_IMAGE)" -t $(BASE_IMAGE_TAG) "$(NODEJS_BASE_IMAGE_DIR)"

print_config: create_shared_volume_folder
	VOLUMES_DIR=${VOLUMES_DIR} docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" config

pass_global_envs_test_to_nodejs_containers:
	@echo "Generating process.env checks from $(PATH_TO_COMPOSE_ENV_FILE)"
	@echo "#!/bin/sh" > ${NODEJS_BASE_IMAGE_DIR}/appservice/check_global_envs.sh
	@echo "set -ex" >> ${NODEJS_BASE_IMAGE_DIR}/appservice/check_global_envs.sh
	@grep -v '^\s*#' $(PATH_TO_COMPOSE_ENV_FILE) | grep -v '^\s*$$' | \
		awk -F= '{print "if [ -z \"$${" $$1 "}\" ]; then echo \"ERROR: " $$1 " is not set\" >&2; exit 1; fi"}' \
		>> ${NODEJS_BASE_IMAGE_DIR}/appservice/check_global_envs.sh

	


create_shared_volume_folder:
	if [ ! -d "$(VOLUMES_DIR)" ]; then \
		mkdir -p "$(VOLUMES_DIR)"; \
	fi

clean:
	VOLUMES_DIR=${VOLUMES_DIR} docker compose -f "$(PATH_TO_COMPOSE)" --env-file "$(PATH_TO_COMPOSE_ENV_FILE)" down --volumes --rmi all --remove-orphans
	rm -rf "$(VOLUMES_DIR)"

babylon:
	 docker cp "$(PROJECT_ROOT)srcs/nginx/staticfiles/babylontest.html" nginx:/var/www/html/babylontest.html

fclean: clean
	rm -rf "$(OUTPUT_FILES_DIR)"
	docker volume prune -f
	docker image prune -a -f
	docker system prune -a --volumes -f

list:
	docker ps -a

.PHONY: up down build all re clean list
