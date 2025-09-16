'use strict'
const { g_myContainerName, containersNameToIp, containersIpToName } = require('/appservice/container_names.cjs');
const { ClientRequest } = require('/appservice/client_request.cjs');

const ipInDockerSubnet = require("/appservice/ip_in_docker_subnet.cjs")
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

const tasks = {
  'ADD_A_NEW_ROOM': {
    url: '/api/new_room',
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

// map of function names and functions above
const WebSocket = require('ws');
const socketToBackend = new WebSocket('ws://backend_hub:3000/inter_container_api');

socketToBackend.on('open', () => {
  console.log('I ' + g_myContainerName + ' connected.');
  socketToBackend.send('Container ' + g_myContainerName + ' connected.');
});


socketToBackend.on('message', (data) => {
  const myClass = ClientRequest.fromWebsocketMessage(data.toString(), 666);
  for (const taskKey in tasks) {
    if (tasks[taskKey].url === myClass.url && tasks[taskKey].method === myClass.method) {
      const result = tasks[taskKey].handler(myClass);
      socketToBackend.send(result.payload);
      return;
    }
  }
  console.warn('No matching task for URL:', myClass.url, 'and method:', myClass.method);
});

socketToBackend.on('close', () => {
  console.log('Websocket connection closed');
});

socketToBackend.on('error', (err) => {
  console.error('Error:', err);
});

// Websocket behaviour above
// --- --- --- --- --- --- --- --- --- --- ---
// 
// --- --- --- --- --- --- --- --- --- --- ---
// Urls<->methods below
for (const taskKey in tasks) {
  fastify.register(async function (fastify) {
    fastify.route({
      method: tasks[taskKey].method,
      url: tasks[taskKey].url,
      handler: (req, reply) => {
        const myClass = ClientRequest.fromHTTP(req, 666);
        const result = tasks[taskKey].handler(myClass);
        return reply.status(result.httpStatus).send(result.payload);
      },
    });
  });
}

fastify.register(async function () {
  fastify.route({
    method: 'GET',
    url: '/api/*',
    handler: (req, reply) => {
      // this will handle http requests
      reply.redirect('/');
    },
  })
})

fastify.listen({ port: process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS, host: process.env.CHATROOM_BIND_TO }, err => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})
