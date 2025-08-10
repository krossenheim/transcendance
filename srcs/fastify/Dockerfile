FROM node:24.5-alpine3.21

RUN mkdir -p /app/

WORKDIR /app/

COPY fastify_core/* /app/
RUN chmod 444 /app/*

RUN npm install --production

EXPOSE 3000

COPY fastify_entryp.sh /app/fastify_entryp.sh
RUN chmod 755 /app/fastify_entryp.sh

STOPSIGNAL SIGTERM

# ENTRYPOINT ["/app/fastify_entryp.sh"]
CMD ["node", "/app/main.cjs"]
