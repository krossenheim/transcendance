FROM debian:bullseye

RUN apt-get update && apt-get install -y nginx openssl procps && rm -rf /var/lib/apt/lists/*

HEALTHCHECK --interval=5s --timeout=2s --retries=3 CMD nginx -t
# ARG SSL_C
# ARG SSL_ST
# ARG SSL_LO
# ARG SSL_OP
# ARG SSL_OU
# ARG SSL_CN

# ENV SSL_C=${SSL_C}
# ENV SSL_ST=${SSL_ST}
# ENV SSL_LO=${SSL_LO}
# ENV SSL_OP=${SSL_OP}
# ENV SSL_OU=${SSL_OU}
# ENV SSL_CN=${SSL_CN}

COPY nginx.conf /etc/nginx/

COPY mysite.conf /etc/nginx/sites-enabled/
RUN chmod 644 /etc/nginx/sites-enabled/*

#RUN mkdir -p /var/www/html/adminer/logs && \
#chown -R www-data:www-data /var/www/html &&\
#chmod -R 755 /var/www/html

RUN chmod 644 /etc/nginx/nginx.conf
#RUN mkdir -p /etc/nginx/conf.f/
#RUN chmod 644 /etc/nginx/conf.d/*.conf

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
