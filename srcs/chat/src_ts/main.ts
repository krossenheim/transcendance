"use strict";
import type { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";
import {
  socketToHub,
  setSocketOnMessageHandler,
} from "./utils/socket_to_hub.js";
import Fastify from "fastify";
import ChatRooms from "./roomClass.js";
import websocketPlugin from "@fastify/websocket";

const fastify = Fastify({
  logger: {
    level: "info", // or 'debug' for more verbosity
    transport: {
      target: "pino-pretty", // pretty-print logs in development
      options: {
        colorize: true,
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    },
  },
});

fastify.register(websocketPlugin);

const singletonChatRooms = new ChatRooms();

const chatRoomTasks = {
  ADD_A_NEW_ROOM: {
    funcId: "/api/chat/add_a_new_room",
    handler: singletonChatRooms.addRoom.bind(singletonChatRooms),
  },
  LIST_ROOMS: {
    funcId: "/api/chat/list_rooms",
    handler: singletonChatRooms.listRooms.bind(singletonChatRooms),
  },
  SEND_MESSAGE_TO_ROOM: {
    funcId: "/api/chat/send_message_to_room",
    handler: singletonChatRooms.sendMessage.bind(singletonChatRooms),
  },
  ADD_USER_TO_ROOM: {
    funcId: "/api/chat/add_to_room",
    handler: singletonChatRooms.addUserToRoom.bind(singletonChatRooms),
  },
};

// Setup WebSocket handler
setSocketOnMessageHandler(socketToHub, { tasks: chatRoomTasks });

// // HTTP route registration function
// function registerChatRoomRoutes(fastify: FastifyInstance) {
//   // Iterate entries (key and value) instead of keys only
//   for (const [taskKey, task] of Object.entries(chatRoomTasks)) {
//     fastify.route({
//       method: task.method,
//       funcId: task.funcId,
//       handler: async (
//         req: FastifyRequest<{ Body: z.infer<typeof ForwardToContainerSchema> }>,
//         reply: FastifyReply
//       ) => {
//         const result = await task.handler(req.body);
      
//         return reply.status(333).send({ hehe: "Hihi" });
//       },
//     });
//   }
// }

// const port = parseInt(
//   process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || "3000",
//   10
// );
// const host = process.env.AUTH_BIND_TO || "0.0.0.0";

// fastify.listen({ port, host }, (err, address) => {
//   if (err) {
//     console.error(err);
//     process.exit(1);
//   }
//   console.info(`Server listening at ${address}`);
// });
