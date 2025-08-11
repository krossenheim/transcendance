NAME = chatroom_exec

SOURCES	=	chatroom.cpp main.cpp

SRCDIR = src/
OBJDIR = objs/

CFLAGS = -I ./include

OBJS	=	$(SOURCES:%.cpp=$(OBJDIR)%.o)

DEPENDENCIES = $(OBJS:%.o=%.d)
CFLAGS	+=	-Wall -Wextra -Werror -MMD -std=c++17

$(OBJDIR)%.o: $(SRCDIR)%.cpp | $(OBJDIR)
	c++ $(CFLAGS) -c $< -o $@

all: $(NAME)

$(NAME): $(OBJS)
	c++ $(CFLAGS) $(OBJS) -o $(NAME)

$(OBJDIR):
	mkdir $(OBJDIR)

re: clean all

clean:
	rm	-rf	$(OBJDIR)
	rm	-f $(NAME)

-include $(DEPENDENCIES)

.phony: make re clean fclean objdir 
