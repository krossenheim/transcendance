FROM debian:bullseye

RUN apt-get update && apt-get install g++ build-essential libwebsocketpp-dev -y && rm -rf /var/lib/apt/lists/*

CMD ./chatroom/chat
