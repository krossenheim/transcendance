FROM debian:bullseye

RUN mkdir -p /chatroom/

WORKDIR /chatroom/

# Dont want to move objs or the executable.
COPY chatroom_core/ .
RUN chmod -R 755 .

RUN apt-get update && apt-get install g++ build-essential libwebsocketpp-dev libssl-dev libboost-all-dev -y && rm -rf /var/lib/apt/lists/*

RUN make re


CMD ./chatroom_exec ws://nginx:443/ws
