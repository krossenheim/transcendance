'use strict'
const { g_myContainerName } = require('/appservice/container_names.cjs');
const { ClientRequest } = require('/appservice/client_request.cjs');
const { ErrorPayload } = require('/appservice/error_payload.cjs');
const { MessageFromService } = require('/appservice/api_message.cjs');
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

async function t1(requestbody) {
  try {
    const response = await axios.post(
      `http://` + process.env.HUB_NAME + `:${process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS}/inter_api/subscribe_online_status`,
      { subscribe: [1, 2, 3] }
    );
    const res = new MessageFromService(httpStatus.OK, null, 't1 test', { unsubscribe: response.data });
    return (res);
  } catch (err) {
    const res = new MessageFromService(httpStatus.BAD_REQUEST, null, 't1 test', new ErrorPayload("Error", err.message));
    return (res);
  }

}

async function t2(requestbody) {
  try {
    const response = await axios.post(
      `http://` + process.env.HUB_NAME + `:${process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS}/inter_api/unsubscribe_online_status`,
      { subscribe: [1, 2, 3] }
    );
    const res = new MessageFromService(httpStatus.OK, null, 't2 test', { unsubscribe: response.data });
    return (res);
  } catch (err) {
    const res = new MessageFromService(httpStatus.BAD_REQUEST, null, 't2 test', new ErrorPayload("Error", err.message));
    return (res);
  }

}

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
  'T1': {
    url: '/api/t1',
    handler: t1,
    method: 'POST',
  },
  'T2': {
    url: '/api/t2',
    handler: t2,
    method: 'POST',
  },
};

//

// map of function names and functions above
const WebSocket = require('ws');
const socketToBackend = new WebSocket('ws://' + process.env.HUB_NAME + ':3000/inter_api');

socketToBackend.on('open', () => {
  console.log('I ' + g_myContainerName + ' connected.');
  socketToBackend.send('Container ' + g_myContainerName + ' connected.');
});

function isAsync(fn) {
  return fn.constructor.name === 'AsyncFunction';
}

socketToBackend.on('message', async (data) => {
  let clientRequest;
  try {
    clientRequest = JSON.parse(data);
  }
  catch (e) {
    console.log("Received malformed message from socket to backend: '" + data + "'");
    return;
  }
  for (const taskKey in tasks) {
    if (tasks[taskKey].url === clientRequest.endpoint) {
      console.log("Executing task handler for:" + taskKey);
      let result;
      if (isAsync(tasks[taskKey].handler)) {
        result = await tasks[taskKey].handler(clientRequest);
      } else {
        result = tasks[taskKey].handler(clientRequest);
      }
      if (result === undefined) {
        console.log("Handler did not return a value: " + taskKey);
      }
      socketToBackend.send(JSON.stringify(result));
      return;
    }
  }
  console.log('No matching task for URL:', clientRequest.endpoint, 'and method:', clientRequest.method);
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
