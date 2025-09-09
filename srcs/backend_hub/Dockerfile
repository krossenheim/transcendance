FROM nodejs_base_image:1.0

RUN mkdir -p /appservice/

WORKDIR /appservice/

COPY backend_hub_appservice/ /appservice/
RUN chmod 444 /appservice/*

COPY backend_hub_entryp.sh /appservice/backend_hub_entryp.sh
RUN chmod 755 /appservice/backend_hub_entryp.sh

HEALTHCHECK --interval=3s --timeout=5s --start-period=2s --retries=20 \
  CMD curl -fsSLk https://nginx:443/health_check | grep -q "Hello internal network individual." || exit 1

ENTRYPOINT ["/appservice/backend_hub_entryp.sh"]
CMD node /appservice/$BACKEND_HUB_NODE_MAINJS
