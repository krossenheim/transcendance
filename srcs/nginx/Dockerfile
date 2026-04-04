FROM node:24.8-slim AS react_builder

WORKDIR /app/shared

COPY shared/package.json shared/tsconfig.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install

COPY shared ./
RUN npm run build

WORKDIR /app/srcs/frontend

COPY srcs/frontend/package.json srcs/frontend/tsconfig.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install

COPY srcs/frontend/src ./src
COPY srcs/frontend/postcss.config.js ./
COPY srcs/frontend/tailwind.config.js ./
COPY srcs/frontend/vite.config.mts ./
COPY srcs/frontend/index.html ./
COPY srcs/frontend/public ./public
RUN npm run build


FROM nginx:1.29.0

RUN apt-get update && apt-get install -y gettext openssl procps curl \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /etc/nginx/un_expanded/
COPY srcs/nginx/nginx.conf.to_expand /etc/nginx/un_expanded
RUN chmod 644 /etc/nginx/un_expanded/nginx.conf.to_expand

COPY srcs/nginx/mysite.conf.to_expand /etc/nginx/un_expanded
RUN chmod 644 /etc/nginx/un_expanded/mysite.conf.to_expand

RUN rm -f /etc/nginx/conf.d/default.d || true

EXPOSE 443

COPY srcs/nginx/nginx_entryp.sh /etc/nginx_entryp.sh
RUN chmod 755 /etc/nginx_entryp.sh

RUN mkdir -p /var/www/html/
RUN chown -R www-data:www-data /var/www/html/ || true

RUN mkdir -p /var/www/html/react_dist/
COPY --from=react_builder /app/srcs/frontend/dist /var/www/html/react_dist

ENTRYPOINT ["/etc/nginx_entryp.sh"]
CMD ["nginx", "-g", "daemon off;"]
