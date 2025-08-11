NAME = chatroom_exec

SOURCES	=	ChatRoom.cpp ChatRoom_connect.cpp main.cpp

SRCDIR = src/
OBJDIR = objs/

CFLAGS = -I ./include 

OBJS	=	$(SOURCES:%.cpp=$(OBJDIR)%.o)

DEPENDENCIES = $(OBJS:%.o=%.d)
CFLAGS	+=	-Wall -Wextra -Werror -MMD -std=c++17
CFLAGS_FOR_ZAPHOYD_WEBSOCKETS := -lcrypto -lssl

$(OBJDIR)%.o: $(SRCDIR)%.cpp | $(OBJDIR)
	c++ $(CFLAGS) -c $< -o $@ 

all: $(NAME)

$(NAME): $(OBJS)
	c++ $(CFLAGS) $(OBJS) -o $(NAME) $(CFLAGS_FOR_ZAPHOYD_WEBSOCKETS)

$(OBJDIR):
	mkdir $(OBJDIR)

re: clean all

clean:
	rm	-rf	$(OBJDIR)
	rm	-f $(NAME)

-include $(DEPENDENCIES)

.phony: make re clean fclean objdir 
