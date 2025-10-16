"use strict";
import type { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";
import { socketToHub, OurSocket } from "./utils/socket_to_hub.js";
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
import type { T_ForwardToContainer } from "./utils/api/service/hub/hub_interfaces.js";
import { Result } from "./utils/api/service/common/result.js";
import { user_url } from "./utils/api/service/common/endpoints.js";
import type { ErrorResponseType } from "./utils/api/service/common/error.js";
import type { TypeUserSendMessagePayload } from "./utils/api/service/chat/chat_interfaces.js";
import { SendMessagePayloadSchema } from "./utils/api/service/chat/chat_interfaces.js";
import { wrap } from "module";

const socket = new OurSocket(socketToHub, "chat");
const singletonChatRooms = new ChatRooms();
socket.registerEvent(
  user_url.ws.chat.sendMessage,
  async (body: TypeUserSendMessagePayload, wrapper: T_ForwardToContainer) => {
    // singletonChatRooms.sendMessage(body);
    const client_request = SendMessagePayloadSchema.safeParse(wrapper.payload);
    if (!client_request.success) {
      return Result.Err({
        message: client_request.error.message,
      });
    }
    const room = singletonChatRooms.getRoom(client_request.data.roomId);
    if (!room || !room.users.find((userid) => userid === wrapper.user_id)) {
      return Result.Err({ message: "No such room or user not in it" });
    }
    room.users.
    return room.unwrap();
  }
);

//  Type '{ roomId: number; messageString: string; }' is missing the following properties from type '{ roomId: number; roomName: string; }': roomId, roomName
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
