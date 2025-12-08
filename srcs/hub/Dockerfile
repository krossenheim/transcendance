# ---- Builder Stage ----
FROM node:24.8-slim AS builder

ARG SERVICE_NAME
ENV SERVICE_NAME=${SERVICE_NAME}

RUN apt-get update && apt-get install -y python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

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

RUN apt-get update && apt-get install -y curl \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 1001 nodejs && \
    useradd -u 1001 -g nodejs -m -s /usr/sbin/nologin nodejs

ARG SERVICE_NAME
ENV SERVICE_NAME=${SERVICE_NAME}
ENV NODE_ENV=production

RUN mkdir -p /app/shared /app/srcs/${SERVICE_NAME} && \
    chown -R nodejs:nodejs /app

WORKDIR /app/shared

COPY --chown=nodejs:nodejs --from=builder /app/shared/package.json ./
USER nodejs
RUN npm install --only=production --install-links

COPY --chown=nodejs:nodejs --from=builder /app/shared/dist ./dist

WORKDIR /app/srcs/${SERVICE_NAME}
COPY --chown=nodejs:nodejs --from=builder /app/srcs/${SERVICE_NAME}/package.json ./
RUN npm install --only=production --install-links

COPY --chown=nodejs:nodejs --from=builder /app/srcs/${SERVICE_NAME}/dist/srcs/${SERVICE_NAME}/src ./dist
COPY --chown=nodejs:nodejs srcs/${SERVICE_NAME}/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

HEALTHCHECK --interval=2s --timeout=4s --retries=20 \
  CMD curl -fsSLk "https://${PUBLICFACING_WEBSERVER_NAME}:443/health_check" | grep -q "Hello internal network individual." || exit 1

ENTRYPOINT ["./entrypoint.sh"]
CMD ["npm", "start"]
