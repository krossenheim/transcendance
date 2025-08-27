FROM debian:bullseye

RUN apt-get update && apt-get install -y curl ca-certificates 
RUN curl -fsSL https://deb.nodesource.com/setup_current.x | bash - && apt-get install -y nodejs

RUN mkdir -p /thebackend/

WORKDIR /thebackend/

COPY fastify_core/* /thebackend/
RUN chmod 444 /thebackend/*

RUN npm install

COPY fastify_entryp.sh /thebackend/fastify_entryp.sh
RUN chmod 755 /thebackend/fastify_entryp.sh

HEALTHCHECK --interval=3s --timeout=5s --start-period=2s --retries=20 \
  CMD curl -fsSLk https://nginx:443/health_check | grep -q "Hello internal network individual." || exit 1

ENTRYPOINT ["/thebackend/fastify_entryp.sh"]
CMD node /thebackend/$FASTIFY_NODE_MAINJS
