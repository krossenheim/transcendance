FROM nodejs_base_image:1.0

RUN mkdir -p /appservice/

WORKDIR /appservice/

COPY appservice/ /appservice/
RUN chmod 444 /appservice/*

RUN cat /appservice/check_global_envs.sh /appservice/service_entryp.sh > /appservice/entrypoint.sh \
    && chmod +x /appservice/entrypoint.sh

HEALTHCHECK --interval=2s --timeout=4s --retries=20 \
  CMD curl -fsSLk "https://${PUBLICFACING_WEBSERVER_NAME}:443/health_check" | grep -q "Hello internal network individual." || exit 1

ENTRYPOINT ["/appservice/entrypoint.sh"]
CMD node /appservice/$SERVICE_MAINJS
