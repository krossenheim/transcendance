FROM node:24.8.0-trixie-slim

RUN apt-get update && apt-get install -y curl

RUN mkdir -p /appservice/

WORKDIR /appservice/

COPY appservice/ /appservice/
RUN chmod 444 /appservice/*

RUN npm install
