FROM nginx:1.29.0

RUN apt-get update && apt-get install -y gettext openssl procps && rm -rf /var/lib/apt/lists/*

# HEALTHCHECK --interval=5s --timeout=2s --retries=3 CMD nginx -t

RUN mkdir -p /etc/nginx/un_expanded/
COPY nginx.conf.to_expand /etc/nginx/un_expanded
RUN chmod 644 /etc/nginx/un_expanded/nginx.conf.to_expand

# Make un_expanded and move things awaiting nginx_entryp.sh to replace env vars within the files.
COPY mysite.conf.to_expand /etc/nginx/un_expanded
RUN chmod 644 /etc/nginx/un_expanded/mysite.conf.to_expand

# ModSecurity templates (envsubst'd by nginx_entryp.sh). The actual ModSecurity dynamic
# module is NOT installed here by default in this POC — enable module in your build
# or base image to activate blocking rules. These files provide the config and CRS.
COPY modsecurity /etc/nginx/un_expanded/modsecurity
RUN chmod -R 644 /etc/nginx/un_expanded/modsecurity || true

RUN rm -f /etc/nginx/conf.d/default.d

EXPOSE 443

COPY nginx_entryp.sh /etc/nginx_entryp.sh
RUN chmod 777 /etc/nginx_entryp.sh

RUN mkdir -p /var/www/html/
RUN chown -R www-data:www-data /var/www/html/
COPY /staticfiles/ /var/www/html/

RUN mkdir -p /var/www/html/react_dist/
COPY /react_source/dist /var/www/html/react_dist

ENTRYPOINT ["/etc/nginx_entryp.sh"]
CMD ["nginx", "-g", "daemon off;"]
