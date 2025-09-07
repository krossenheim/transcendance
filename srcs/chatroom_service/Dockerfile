FROM nodejs_base_image:1.0

COPY chatroom_appservice/* /appservice/
RUN chmod 444 /appservice/*

CMD node /appservice/$CHATROOM_NODE_MAINJS
