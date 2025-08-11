
PROJECT_ROOT := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
OUTPUT_FILES_DIR := $(PROJECT_ROOT)out
SOURCES_DIR := $(PROJECT_ROOT)srcs

VOLUMES_DIR := $(OUTPUT_FILES_DIR)/transcendance_volumes/

PATH_TO_COMPOSE_ENV_FILE := $(OUTPUT_FILES_DIR)/env_vars_for_docker_compose.env
PATH_TO_COMPOSE := $(SOURCES_DIR)/compose.yml

HOST_IP := $(shell hostname -I | awk '{print $$1}')
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

# append_subnet_to_global_envs:
# 	chmod 644 $(PATH_TO_COMPOSE_ENV_FILE)
# 	@echo -n "TR_NETWORK_SUBNET=$(shell docker network inspect transcendance_network --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}')" >> $(PATH_TO_COMPOSE_ENV_FILE)
# 	chmod 444 $(PATH_TO_COMPOSE_ENV_FILE)

write_global_envs:
	mkdir -p $(OUTPUT_FILES_DIR)
	touch $(PATH_TO_COMPOSE_ENV_FILE)
	chmod 644 $(PATH_TO_COMPOSE_ENV_FILE)
	@echo "# This file is made and populated via the makefile. Your changes are unlikely to be applied." > $(PATH_TO_COMPOSE_ENV_FILE)
# 	@echo "ROOT_DIR=$(PROJECT_ROOT)" >> $(PATH_TO_COMPOSE_ENV_FILE)
# 	@echo "VOLUMES_DIR=$(VOLUMES_DIR)" >> $(PATH_TO_COMPOSE_ENV_FILE)
# 	@echo "HOST_IP=$(HOST_IP)" >> $(PATH_TO_COMPOSE_ENV_FILE)
	chmod 444 $(PATH_TO_COMPOSE_ENV_FILE)

down:
	docker compose  -f $(PATH_TO_COMPOSE) --env-file $(PATH_TO_COMPOSE_ENV_FILE) down

build: write_global_envs create_shared_volume_folder
	docker compose  -f $(PATH_TO_COMPOSE) --env-file $(PATH_TO_COMPOSE_ENV_FILE) build

print_config: write_global_envs create_shared_volume_folder
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

