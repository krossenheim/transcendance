FROM nginx:1.29.0

RUN apt-get update && apt-get install -y gettext openssl procps && rm -rf /var/lib/apt/lists/*

# HEALTHCHECK --interval=5s --timeout=2s --retries=3 CMD nginx -t

COPY nginx.conf /etc/nginx/
RUN chmod 644 /etc/nginx/nginx.conf

# Make site-templates and move things awaiting nginx_entryp.sh to replace env vars within the files.
RUN mkdir -p /etc/nginx/site-templates/
COPY mysite.conf.to_expand /etc/nginx/site-templates
RUN chmod 644 /etc/nginx/site-templates/mysite.conf.to_expand

RUN rm -f /etc/nginx/conf.d/default.d

EXPOSE 443

COPY nginx_entryp.sh /etc/nginx_entryp.sh
RUN chmod 777 /etc/nginx_entryp.sh

ENTRYPOINT ["/etc/nginx_entryp.sh"]
CMD ["nginx", "-g", "daemon off;"]
