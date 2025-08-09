FROM node:18-alpine

RUN apk add --no-cache gettext

RUN mkdir -p /app/
RUN mkdir -p /app_to_expand/

COPY fastify_core/* /app_to_expand/
RUN chmod 444 /app_to_expand/*

EXPOSE 3000

COPY fastify_entryp.sh /app/fastify_entryp.sh
RUN chmod 755 /app/fastify_entryp.sh

ENTRYPOINT ["/app/fastify_entryp.sh"]
CMD ["node", "/app/main.js"]
