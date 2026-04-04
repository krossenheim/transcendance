# ---- Builder Stage ----
FROM node:24.8-slim AS builder

ARG SERVICE_NAME
ENV SERVICE_NAME=${SERVICE_NAME}

WORKDIR /app/shared

COPY shared/package.json shared/tsconfig.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install

COPY shared ./
RUN NODE_OPTIONS="--max-old-space-size=8192" npm run build

WORKDIR /app/containers/${SERVICE_NAME}

COPY containers/${SERVICE_NAME}/package.json containers/${SERVICE_NAME}/tsconfig.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install

COPY containers/${SERVICE_NAME}/src ./src
RUN NODE_OPTIONS="--max-old-space-size=8192" npm run build


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

RUN mkdir -p /app/shared /app/containers/${SERVICE_NAME} && \
    chown -R nodejs:nodejs /app

WORKDIR /app/shared

COPY --chown=nodejs:nodejs --from=builder /app/shared/package.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --only=production --install-links

COPY --chown=nodejs:nodejs --from=builder /app/shared/dist ./dist

WORKDIR /app/containers/${SERVICE_NAME}
COPY --chown=nodejs:nodejs --from=builder /app/containers/${SERVICE_NAME}/package.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --only=production --install-links

COPY --chown=nodejs:nodejs --from=builder /app/containers/${SERVICE_NAME}/dist/containers/${SERVICE_NAME}/src ./dist
COPY --chown=nodejs:nodejs containers/${SERVICE_NAME}/entrypoint.sh ./entrypoint.sh
COPY --chown=nodejs:nodejs containers/${SERVICE_NAME}/sql/ ./sql/
RUN chmod +x ./entrypoint.sh

ENTRYPOINT ["./entrypoint.sh"]
CMD ["npm", "start"]