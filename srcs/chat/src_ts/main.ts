'use strict'
import type { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";
import { socketToHub, setSocketOnMessageHandler } from "./utils/socket_to_hub.js";
import fastifus from 'fastify';

const fastify = fastifus({
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
import websocketPlugin from '@fastify/websocket';

fastify.register(websocketPlugin);
// Setup above

import ChatRooms from './roomClass.js';

// Room class above

const singletonChatRooms = new ChatRooms();


const chatRoomTasks = {
  ADD_A_NEW_ROOM: {
    url: "/api/add_a_new_room",
    handler: singletonChatRooms.addRoom.bind(singletonChatRooms),
    method: "POST",
  },
  LIST_ROOMS: {
    url: "/api/list_rooms",
    handler: singletonChatRooms.listRooms.bind(singletonChatRooms),
    method: "GET",
  },
  SEND_MESSAGE_TO_ROOM: {
    url: "/api/send_message_to_room",
    handler: singletonChatRooms.sendMessage.bind(singletonChatRooms),
    method: "POST",
  },
  ADD_USER_TO_ROOM: {
    url: "/api/add_to_room",
    handler: singletonChatRooms.addUserToRoom.bind(singletonChatRooms),
    method: "POST",
  },
};

// Setup WebSocket handler
setSocketOnMessageHandler(socketToHub, { tasks: chatRoomTasks });

// HTTP route registration function
function registerChatRoomRoutes(fastify: FastifyInstance) {
  // Iterate entries (key and value) instead of keys only
  for (const [taskKey, task] of Object.entries(chatRoomTasks)) {
    fastify.route({
      method: task.method,
      url: task.url,
      handler: async (req: FastifyRequest, reply: FastifyReply) => {
        const result = await task.handler(req);
        return reply.status(333).send({"hehe" : "Hihi"});
      },
    });
  }
}

fastify.listen({ port: parseInt(process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || "-666"),  host: process.env.CHATROOM_BIND_TO || "-643543"}, (err : any) => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})
