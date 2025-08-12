FROM transcendance_debian_base:1.0

RUN mkdir -p /chatroom/

WORKDIR /chatroom/

# Dont want to move objs or the executable.
COPY chatroom_core/ .
RUN chmod -R 755 .

RUN make re


CMD ./chatroom_exec ws://nginx:443/ws
