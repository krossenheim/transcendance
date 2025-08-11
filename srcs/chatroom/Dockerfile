FROM debian:bullseye

RUN if [ -z "${BACKEND_PORT}'" ]; then echo "ERROR: BACKEND_PORT is not set" >&2; exit 1; fi
RUN if [ -z "${BACKEND_NAME}'" ]; then echo "ERROR: BACKEND_NAME is not set" >&2; exit 1; fi

RUN mkdir -p /chatroom/

WORKDIR /chatroom/

# Dont want to move objs or the executable.
COPY chatroom_core/ .
RUN chmod -R 755 .

RUN apt-get update && apt-get install g++ build-essential libwebsocketpp-dev libssl-dev libboost-all-dev -y && rm -rf /var/lib/apt/lists/*

RUN make re

CMD ./chatroom_exec ws://$BACKEND_NAME:$BACKEND_PORT/ws
