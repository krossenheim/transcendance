FROM nodejs_base_image:1.0

RUN mkdir -p /appservice/

WORKDIR /appservice/

COPY appservice/ /appservice/
RUN chmod 444 /appservice/*

RUN ( \
      while IFS= read -r line; do echo "$$line"; done < /appservice/check_global_envs.sh; \
      while IFS= read -r line; do echo "$$line"; done < /appservice/service_entryp.sh; \
    ) > /appservice/entrypoint.sh \
    && chmod +x /appservice/entrypoint.sh

RUN cat "/appservice/entrypoint.sh"

ENTRYPOINT ["/appservice/entrypoint.sh"]
CMD node /appservice/$SERVICE_MAINJS
