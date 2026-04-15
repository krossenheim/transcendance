NAME		= pong-cli
CC			= cc
CFLAGS		= -Wall -Wextra -Werror -O2
LDFLAGS		= -lcurl -lwebsockets -lncursesw -lpthread -lssl -lcrypto -lm

SRC_DIR		= src
INC_DIR		= include
OBJ_DIR		= obj
LIB_DIR		= lib

SRCS		= $(SRC_DIR)/main.c \
			  $(SRC_DIR)/auth.c \
			  $(SRC_DIR)/websocket.c \
			  $(SRC_DIR)/game.c \
			  $(SRC_DIR)/renderer.c \
			  $(SRC_DIR)/starfield.c \
			  $(SRC_DIR)/utils.c \
			  $(SRC_DIR)/cJSON.c

OBJS		= $(SRCS:$(SRC_DIR)/%.c=$(OBJ_DIR)/%.o)

HEADERS		= $(INC_DIR)/pong_cli.h \
			  $(INC_DIR)/auth.h \
			  $(INC_DIR)/websocket.h \
			  $(INC_DIR)/game.h \
			  $(INC_DIR)/renderer.h \
			  $(INC_DIR)/starfield.h \
			  $(INC_DIR)/utils.h \
			  $(INC_DIR)/cJSON.h

GREEN		= \033[0;32m
YELLOW		= \033[0;33m
RED			= \033[0;31m
NC			= \033[0m

# Progress counter
TOTAL_OBJS	:= $(words $(OBJS))
_NPROG		:= x
_CPROG		= $(words $(_NPROG))$(eval _NPROG := x $(_NPROG))
BAR_WIDTH	:= 20
define PROGBAR
	FILLED=$$(( $(1) * $(BAR_WIDTH) / $(TOTAL_OBJS) )); \
	EMPTY=$$(( $(BAR_WIDTH) - FILLED )); \
	BAR=""; \
	i=0; while [ $$i -lt $$FILLED ]; do BAR="$${BAR}█"; i=$$((i+1)); done; \
	i=0; while [ $$i -lt $$EMPTY ]; do BAR="$${BAR}░"; i=$$((i+1)); done; \
	PCT=$$(( $(1) * 100 / $(TOTAL_OBJS) )); \
	printf "\r$(2)[%d/%d] (%3d%%) $$BAR $(3)$(NC)\033[K" $(1) $(TOTAL_OBJS) $$PCT
endef

.PHONY: all build clean fclean re install deps check-deps help

all:
	@$(MAKE) --no-print-directory check-deps
	@$(MAKE) --no-print-directory build

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
	@$(call PROGBAR,$(TOTAL_OBJS),$(GREEN),Linking $(NAME)...)
	@$(CC) $(OBJS) -o $(NAME) $(LDFLAGS)
	@printf "\n$(GREEN)Build complete: $(NAME)$(NC)\n"

$(OBJ_DIR):
	@mkdir -p $(OBJ_DIR)

$(OBJ_DIR)/%.o: $(SRC_DIR)/%.c $(HEADERS)
	@$(call PROGBAR,$(_CPROG),$(YELLOW),Compiling $<...)
	@$(CC) $(CFLAGS) -I$(INC_DIR) -c $< -o $@

clean:
	@echo "$(RED)Cleaning object files...$(NC)"
	rm -rf $(OBJ_DIR)

fclean: clean
	@echo "$(RED)Removing $(NAME)...$(NC)"
	rm -f $(NAME)

re: fclean build

deps:
	@echo "$(YELLOW)Installing dependencies...$(NC)"
	sudo apt-get update
	sudo apt-get install -y libcurl4-openssl-dev libwebsockets-dev libncurses5-dev libssl-dev

install: $(NAME)
	@echo "$(GREEN)Installing $(NAME) to /usr/local/bin...$(NC)"
	sudo cp $(NAME) /usr/local/bin/
	@echo "$(GREEN)Installation complete!$(NC)"

uninstall:
	@echo "$(RED)Removing $(NAME) from /usr/local/bin...$(NC)"
	sudo rm -f /usr/local/bin/$(NAME)

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
