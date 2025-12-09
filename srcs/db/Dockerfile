# ---- Builder Stage ----
FROM node:24.8-slim AS builder

ARG SERVICE_NAME
ENV SERVICE_NAME=${SERVICE_NAME}

WORKDIR /app/shared

COPY shared/package.json shared/tsconfig.json ./
RUN npm install

COPY shared ./
RUN npm run build

WORKDIR /app/srcs/${SERVICE_NAME}

COPY srcs/${SERVICE_NAME}/package.json srcs/${SERVICE_NAME}/tsconfig.json ./
RUN npm install

COPY srcs/${SERVICE_NAME}/src ./src
RUN npm run build


# ---- Runner Stage ----
FROM node:24.8-slim AS runner

RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -m -s /usr/sbin/nologin nodejs && \
    apt-get update && apt-get install -y sqlite3 gosu curl python3 && \
    rm -rf /var/lib/apt/lists/*

ARG SERVICE_NAME
ENV SERVICE_NAME=${SERVICE_NAME}
ENV NODE_ENV=production

RUN mkdir -p /etc/database_data && \
    chown -R nodejs:nodejs /etc/database_data

RUN mkdir -p /app/shared /app/srcs/${SERVICE_NAME} && \
    chown -R nodejs:nodejs /app

WORKDIR /app/shared

COPY --chown=nodejs:nodejs --from=builder /app/shared/package.json ./
RUN npm install --only=production --install-links

COPY --chown=nodejs:nodejs --from=builder /app/shared/dist ./dist

WORKDIR /app/srcs/${SERVICE_NAME}
COPY --chown=nodejs:nodejs --from=builder /app/srcs/${SERVICE_NAME}/package.json ./
RUN npm install --only=production --install-links

COPY --chown=nodejs:nodejs --from=builder /app/srcs/${SERVICE_NAME}/dist/srcs/${SERVICE_NAME}/src ./dist
COPY --chown=nodejs:nodejs srcs/${SERVICE_NAME}/entrypoint.sh ./entrypoint.sh
COPY --chown=nodejs:nodejs srcs/${SERVICE_NAME}/structure.sql ./structure.sql
RUN chmod +x ./entrypoint.sh

ENTRYPOINT ["./entrypoint.sh"]
CMD ["npm", "start"]