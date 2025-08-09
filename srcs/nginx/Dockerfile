FROM debian:bullseye

RUN apt-get update && apt-get install -y gettext nginx openssl procps && rm -rf /var/lib/apt/lists/*

HEALTHCHECK --interval=5s --timeout=2s --retries=3 CMD nginx -t

COPY nginx.conf /etc/nginx/

COPY mysite.conf.to_expand /etc/nginx/
RUN chmod 644 /etc/nginx/sites-enabled/*

RUN chmod 644 /etc/nginx/nginx.conf

RUN mkdir -p /etc/nginx/ssl

COPY sign_cert.sh /etc/nginx/ssl/sign_cert.sh

RUN chmod 777 /etc/nginx/ssl/sign_cert.sh

RUN rm -f /etc/nginx/conf.d/default.d

STOPSIGNAL SIGTERM

EXPOSE 443

COPY nginx_entryp.sh /etc/nginx/nginx_entryp.sh
RUN chmod 777 /etc/nginx/nginx_entryp.sh

ENTRYPOINT ["/etc/nginx/nginx_entryp.sh"]
CMD ["nginx", "-g", "daemon off;"]
