FROM nodejs_base_image:1.0

COPY chatroom_appservice/ /appservice/
RUN chmod 444 /appservice/*

COPY chatroom_service_entryp.sh  /appservice/chatroom_service_entryp.sh 
RUN chmod 755 /appservice/chatroom_service_entryp.sh 

ENTRYPOINT ["/appservice/chatroom_service_entryp.sh"]
CMD node /appservice/$CHATROOM_NODE_MAINJS
