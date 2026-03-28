# Pong CLI - C Implementation
# Build system for the command-line Pong client

NAME		= pong-cli
CC			= cc
CFLAGS		= -Wall -Wextra -Werror -g -O2
LDFLAGS		= -lcurl -lwebsockets -lncursesw -lpthread -lssl -lcrypto -lm

# Directories
SRC_DIR		= src
INC_DIR		= include
OBJ_DIR		= obj
LIB_DIR		= lib

# Source files
SRCS		= $(SRC_DIR)/main.c \
			  $(SRC_DIR)/auth.c \
			  $(SRC_DIR)/websocket.c \
			  $(SRC_DIR)/game.c \
			  $(SRC_DIR)/renderer.c \
			  $(SRC_DIR)/starfield.c \
			  $(SRC_DIR)/utils.c \
			  $(SRC_DIR)/cJSON.c

# Object files
OBJS		= $(SRCS:$(SRC_DIR)/%.c=$(OBJ_DIR)/%.o)

# Header files
HEADERS		= $(INC_DIR)/pong_cli.h \
			  $(INC_DIR)/auth.h \
			  $(INC_DIR)/websocket.h \
			  $(INC_DIR)/game.h \
			  $(INC_DIR)/renderer.h \
			  $(INC_DIR)/starfield.h \
			  $(INC_DIR)/utils.h \
			  $(INC_DIR)/cJSON.h

# Colors for output
GREEN		= \033[0;32m
YELLOW		= \033[0;33m
RED			= \033[0;31m
NC			= \033[0m

.PHONY: all build clean fclean re install deps check-deps help

all:
	@$(MAKE) --no-print-directory check-deps
	@$(MAKE) --no-print-directory build

# Check if required headers are available, install if missing
check-deps:
	@MISSING=""; \
	echo "$(YELLOW)Checking dependencies...$(NC)"; \
	if ! echo '#include <curl/curl.h>' | $(CC) -E -x c - >/dev/null 2>&1; then \
		MISSING="$$MISSING libcurl4-openssl-dev"; \
	fi; \
	if ! echo '#include <libwebsockets.h>' | $(CC) -E -x c - >/dev/null 2>&1; then \
		MISSING="$$MISSING libwebsockets-dev"; \
	fi; \
	if ! echo '#include <ncurses.h>' | $(CC) -E -x c - >/dev/null 2>&1; then \
		MISSING="$$MISSING libncurses5-dev"; \
	fi; \
	if ! echo '#include <openssl/ssl.h>' | $(CC) -E -x c - >/dev/null 2>&1; then \
		MISSING="$$MISSING libssl-dev"; \
	fi; \
	if [ -n "$$MISSING" ]; then \
		echo "$(RED)Missing packages:$$MISSING$(NC)"; \
		echo "$(YELLOW)Installing missing dependencies...$(NC)"; \
		sudo apt-get update -qq && sudo apt-get install -y $$MISSING; \
	else \
		echo "$(GREEN)All dependencies found.$(NC)"; \
	fi

build: $(NAME)

$(NAME): $(OBJ_DIR) $(OBJS)
	@echo "$(GREEN)Linking $(NAME)...$(NC)"
	$(CC) $(OBJS) -o $(NAME) $(LDFLAGS)
	@echo "$(GREEN)Build complete: $(NAME)$(NC)"

$(OBJ_DIR):
	@mkdir -p $(OBJ_DIR)

$(OBJ_DIR)/%.o: $(SRC_DIR)/%.c $(HEADERS)
	@echo "$(YELLOW)Compiling $<...$(NC)"
	$(CC) $(CFLAGS) -I$(INC_DIR) -c $< -o $@

clean:
	@echo "$(RED)Cleaning object files...$(NC)"
	rm -rf $(OBJ_DIR)

fclean: clean
	@echo "$(RED)Removing $(NAME)...$(NC)"
	rm -f $(NAME)

re: fclean build

# Install dependencies (Debian/Ubuntu)
deps:
	@echo "$(YELLOW)Installing dependencies...$(NC)"
	sudo apt-get update
	sudo apt-get install -y libcurl4-openssl-dev libwebsockets-dev libncurses5-dev libssl-dev

# Install the binary
install: $(NAME)
	@echo "$(GREEN)Installing $(NAME) to /usr/local/bin...$(NC)"
	sudo cp $(NAME) /usr/local/bin/
	@echo "$(GREEN)Installation complete!$(NC)"

# Uninstall the binary
uninstall:
	@echo "$(RED)Removing $(NAME) from /usr/local/bin...$(NC)"
	sudo rm -f /usr/local/bin/$(NAME)

# Debug build
debug: CFLAGS += -DDEBUG -g3 -fsanitize=address
debug: LDFLAGS += -fsanitize=address
debug: re

help:
	@echo "$(GREEN)Pong CLI Build System$(NC)"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@echo "  all      - Build the CLI (default)"
	@echo "  clean    - Remove object files"
	@echo "  fclean   - Remove object files and binary"
	@echo "  re       - Rebuild everything"
	@echo "  deps     - Install all system dependencies"
	@echo "  check-deps - Check and install missing dependencies"
	@echo "  install  - Install binary to /usr/local/bin"
	@echo "  uninstall- Remove binary from /usr/local/bin"
	@echo "  debug    - Build with debug symbols and sanitizers"
	@echo "  help     - Show this help message"
