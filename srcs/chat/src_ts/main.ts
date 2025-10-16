"use strict";
import type { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";
import {
  socketToHub, OurSocket
  
} from "./utils/socket_to_hub.js";
import Fastify from "fastify";
import ChatRooms from "./roomClass.js";
import websocketPlugin, { type WebsocketHandler } from "@fastify/websocket";


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
import type { TypeRoomSchema } from "./utils/api/service/chat/db_models.js";
import { Result } from "./utils/api/service/common/result.js";
import { user_url } from "./utils/api/service/common/endpoints.js";
import type { ErrorResponseType } from "./utils/api/service/common/error.js";

const socket = new OurSocket(socketToHub, "chat");
const singletonChatRooms = new ChatRooms();
socket.registerEvent(user_url.ws.chat.sendMessage, async (body : TypeRoomSchema) => {
	// singletonChatRooms.sendMessage(body);
  const room = singletonChatRooms.sendMessage(body);
  return (room);
});

//  Type '{ room_id: number; messageString: string; }' is missing the following properties from type '{ roomId: number; roomName: string; }': roomId, roomName
// const chatRoomTasks = {
//   ADD_A_NEW_ROOM: {
//     funcId: "/api/chat/add_a_new_room",
//     handler: singletonChatRooms.addRoom.bind(singletonChatRooms),
//   },
//   LIST_ROOMS: {
//     funcId: "/api/chat/list_rooms",
//     handler: singletonChatRooms.listRooms.bind(singletonChatRooms),
//   },
//   SEND_MESSAGE_TO_ROOM: {
//     funcId: "/api/chat/send_message_to_room",
//     handler: singletonChatRooms.sendMessage.bind(singletonChatRooms),
//   },
//   ADD_USER_TO_ROOM: {
//     funcId: "/api/chat/add_to_room",
//     handler: singletonChatRooms.addUserToRoom.bind(singletonChatRooms),
//   },
// };

// setSocketOnMessageHandler(socketToHub, { tasks: chatRoomTasks });

