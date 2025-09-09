FROM nodejs_base_image:1.0

# WORKDIR /appservice

COPY database_service/ /appservice/
RUN chmod -R 444 /appservice/*

CMD node /appservice/$DATABASE_SERVICE_MAINJS
