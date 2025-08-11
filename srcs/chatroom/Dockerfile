FROM debian:bullseye

RUN mkdir -p /chatroom/

COPY chatroom_core/ /chatroom/
RUN chmod -R 755 /chatroom/

# RUN apt-get update && apt-get install g++ build-essential libwebsocketpp-dev -y && rm -rf /var/lib/apt/lists/*

#wscat/nodejs for debugging only
RUN apt-get update && apt-get install g++ build-essential libwebsocketpp-dev nodejs npm -y && rm -rf /var/lib/apt/lists/*

RUN npm install -g wscat

COPY eternal.sh /chatroom/
RUN chmod 777 eternal.sh

RUN bash eternal.sh