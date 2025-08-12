FROM nginx:1.29.0

RUN if [ -z "${TR_NETWORK_SUBNET}" ]; then echo "ERROR: TR_NETWORK_SUBNET is not set" >&2; exit 1; fi

RUN apt-get update && apt-get install -y gettext openssl procps && rm -rf /var/lib/apt/lists/*

# HEALTHCHECK --interval=5s --timeout=2s --retries=3 CMD nginx -t

RUN mkdir -p /etc/nginx/un_expanded/
COPY nginx.conf.to_expand /etc/nginx/un_expanded
RUN chmod 644 /etc/nginx/un_expanded/nginx.conf.to_expand

# Make un_expanded and move things awaiting nginx_entryp.sh to replace env vars within the files.
COPY mysite.conf.to_expand /etc/nginx/un_expanded
RUN chmod 644 /etc/nginx/un_expanded/mysite.conf.to_expand

RUN rm -f /etc/nginx/conf.d/default.d

EXPOSE 443

COPY nginx_entryp.sh /etc/nginx_entryp.sh
RUN chmod 777 /etc/nginx_entryp.sh

ENTRYPOINT ["/etc/nginx_entryp.sh"]
CMD ["nginx", "-g", "daemon off;"]
