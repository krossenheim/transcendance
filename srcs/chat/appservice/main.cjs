'use strict'
const { g_myContainerName } = require('/appservice/container_names.cjs');
const { ClientRequest } = require('/appservice/client_request.cjs');
const { httpStatus } = require('/appservice/httpStatusEnum.cjs');
const axios = require('axios');
const fastify = require('fastify')({
  logger: {
    level: 'info', // or 'debug' for more verbosity
    transport: {
      target: 'pino-pretty', // pretty-print logs in development
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      }
    }
  }
})
fastify.register(require('@fastify/websocket'))
// Setup above

const { ChatRooms } = require("./roomClass.cjs");

// Room class above

const singletonChatRooms = new ChatRooms();

const chatRoomTasks = {
  'ADD_A_NEW_ROOM': {
    url: '/api/add_a_new_room',
    handler: singletonChatRooms.addRoom.bind(singletonChatRooms),
    method: 'POST',
  },
  'LIST_ROOMS': {
    url: '/api/list_rooms',
    handler: singletonChatRooms.listRooms.bind(singletonChatRooms),
    method: 'GET',
  },
  'SEND_MESSAGE_TO_ROOM': {
    url: '/api/send_message_to_room',
    handler: singletonChatRooms.sendMessage.bind(singletonChatRooms),
    method: 'POST',
  },
  'ADD_USER_TO_ROOM': {
    url: '/api/add_to_room',
    handler: singletonChatRooms.addUserToRoom.bind(singletonChatRooms),
    method: 'POST',
  },
};

//

const { socketToHub, setSocketOnMessageHandler } = require("/appservice/socket_to_hub.cjs");
// ws handler
setSocketOnMessageHandler(socketToHub, { tasks: chatRoomTasks });
// http handling
for (const taskKey in chatRoomTasks) {
  fastify.register(async function (fastify) {
    fastify.route({
      method: chatRoomTasks[taskKey].method,
      url: chatRoomTasks[taskKey].url,
      handler: (req, reply) => {
        const client_request = ClientRequest.fromHTTP(req, 666);
        const result = chatRoomTasks[taskKey].handler(client_request);
        return reply.status(result.httpStatus).send(result.payload);
      },
    });
  });
}

fastify.listen({ port: process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS, host: process.env.CHATROOM_BIND_TO }, err => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})
