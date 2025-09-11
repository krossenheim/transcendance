FROM nodejs_base_image:1.0

COPY auth_service/ /appservice/
RUN chmod -R 444 /appservice/*

CMD node /appservice/$AUTH_SERVICE_MAINJS
