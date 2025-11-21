FROM nodejs_base_image:1.0

RUN apt-get update && \
    apt-get install -y sqlite3 libsqlite3-dev && \
    apt-get clean

RUN mkdir -p /appservice/

WORKDIR /appservice/

COPY appservice/ /appservice/
COPY dist/ /appservice/
COPY structure.sql /appservice/
RUN chmod 444 /appservice/*

RUN cat /appservice/check_global_envs.sh /appservice/service_entryp.sh > /appservice/entrypoint.sh \
    && chmod +x /appservice/entrypoint.sh

ENTRYPOINT ["/appservice/entrypoint.sh"]
CMD node /appservice/$SERVICE_MAINJS
