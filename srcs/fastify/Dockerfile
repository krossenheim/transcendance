FROM node:18-alpine

RUN apk add --no-cache gettext

RUN mkdir -p /app/

COPY fastify_core/* /app/
RUN chmod 444 /app/*

EXPOSE 3000

COPY fastify_entryp.sh /app/fastify_entryp.sh
RUN chmod 755 /app/fastify_entryp.sh

ENTRYPOINT ["/app/fastify_entryp.sh"]
CMD ["node", "/app/main.js"]
