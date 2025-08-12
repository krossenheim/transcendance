
PROJECT_ROOT := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
OUTPUT_FILES_DIR := $(PROJECT_ROOT)out
SOURCES_DIR := $(PROJECT_ROOT)srcs

VOLUMES_DIR := $(OUTPUT_FILES_DIR)/transcendance_volumes/

PATH_TO_COMPOSE_ENV_FILE := $(SOURCES_DIR)/globals.env
PATH_TO_COMPOSE := $(SOURCES_DIR)/compose.yml

PATH_TO_BASE_IMAGE := $(PROJECT_ROOT)srcs/base_debian/Dockerfile
BASE_IMAGE_TAG := transcendance_debian_base:1.0

TR_NETWORK_SUBNET=172.18.0.0/16

$(NAME): all

all: build 
	docker compose   -f $(PATH_TO_COMPOSE) --env-file $(PATH_TO_COMPOSE_ENV_FILE) up -d

dnginx:
	docker exec -it nginx "cat /var/log/nginx/error.log"

# secrets_present:
# 	@if [ ! -d "secrets/" ]; then \
# 		echo "Secrets folder not present. Kindly provide it."; \
# 		exit 42; \
# 	fi

re: down all

down:
	docker compose  -f $(PATH_TO_COMPOSE) --env-file $(PATH_TO_COMPOSE_ENV_FILE) down

build: build_base_debian  create_shared_volume_folder
	docker compose  -f $(PATH_TO_COMPOSE) --env-file $(PATH_TO_COMPOSE_ENV_FILE) build

build_base_debian:
	docker build -f $(PATH_TO_BASE_IMAGE) -t $(BASE_IMAGE_TAG) .

print_config:  create_shared_volume_folder
	docker compose  -f $(PATH_TO_COMPOSE) --env-file $(PATH_TO_COMPOSE_ENV_FILE) config

create_shared_volume_folder:
	if [ ! -d $(VOLUMES_DIR) ]; then \
		mkdir -p $(VOLUMES_DIR); \
		mkdir -p $(VOLUMES_DIR); \
	fi

clean:
	docker compose   -f $(PATH_TO_COMPOSE) --env-file $(PATH_TO_COMPOSE_ENV_FILE) down --volumes --rmi all --remove-orphans
	rm -rf $(VOLUMES_DIR)

fclean: clean 
	rm -rf $(OUTPUT_FILES_DIR)
	docker volume prune -f
	docker image prune -a -f 
	docker system prune -a --volumes -f

list:
	docker ps -a

.phony: up down build all re clean list

