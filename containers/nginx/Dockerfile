FROM node:24.8-slim AS react_builder

WORKDIR /app/shared

COPY shared/package.json shared/tsconfig.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install

COPY shared ./
RUN npm run build

WORKDIR /app/containers/frontend

COPY containers/frontend/package.json containers/frontend/tsconfig.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install

COPY containers/frontend/src ./src
COPY containers/frontend/postcss.config.js ./
COPY containers/frontend/tailwind.config.js ./
COPY containers/frontend/vite.config.mts ./
COPY containers/frontend/index.html ./
COPY containers/frontend/public ./public
RUN npm run build


FROM nginx:1.29.0

RUN apt-get update && apt-get install -y gettext openssl procps curl \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /etc/nginx/un_expanded/
COPY containers/nginx/nginx.conf.to_expand /etc/nginx/un_expanded
RUN chmod 644 /etc/nginx/un_expanded/nginx.conf.to_expand

COPY containers/nginx/mysite.conf.to_expand /etc/nginx/un_expanded
RUN chmod 644 /etc/nginx/un_expanded/mysite.conf.to_expand

RUN rm -f /etc/nginx/conf.d/default.d || true

EXPOSE 443

COPY containers/nginx/nginx_entryp.sh /etc/nginx_entryp.sh
RUN chmod 755 /etc/nginx_entryp.sh

RUN mkdir -p /var/www/html/
RUN chown -R www-data:www-data /var/www/html/ || true

RUN mkdir -p /var/www/html/react_dist/
COPY --from=react_builder /app/containers/frontend/dist /var/www/html/react_dist

ENTRYPOINT ["/etc/nginx_entryp.sh"]
CMD ["nginx", "-g", "daemon off;"]
