FROM debian:bullseye

RUN apt-get update && apt-get install -y curl ca-certificates 
RUN curl -fsSL https://deb.nodesource.com/setup_current.x | bash - && apt-get install -y nodejs

RUN mkdir -p /app/

WORKDIR /app/

COPY fastify_core/* /app/
RUN chmod 444 /app/*

RUN npm install --production

EXPOSE 3000

COPY fastify_entryp.sh /app/fastify_entryp.sh
RUN chmod 755 /app/fastify_entryp.sh

# ENTRYPOINT ["/app/fastify_entryp.sh"]
CMD node /app/$FASTIFY_NODE_MAINJS
