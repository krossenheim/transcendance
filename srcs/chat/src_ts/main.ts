"use strict";
import { socketToHub, OurSocket } from "./utils/socket_to_hub.js";
import Fastify from "fastify";
import ChatRooms from "./roomClass.js";
import websocketPlugin, { type WebsocketHandler } from "@fastify/websocket";
import type { T_ForwardToContainer } from "./utils/api/service/hub/hub_interfaces.js";
import { Result } from "./utils/api/service/common/result.js";
import { user_url } from "./utils/api/service/common/endpoints.js";
import type {
  TypeAddRoomPayloadSchema,
  TypeUserSendMessagePayload,
} from "./utils/api/service/chat/chat_interfaces.js";
import { SendMessagePayloadSchema } from "./utils/api/service/chat/chat_interfaces.js";
import type { TypeRoomSchema } from "utils/api/service/chat/db_models.js";

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

const socket = new OurSocket(socketToHub, "chat");
const singletonChatRooms = new ChatRooms();
socket.registerEvent(
  user_url.ws.chat.sendMessage,
  async (body: TypeUserSendMessagePayload, wrapper: T_ForwardToContainer) => {
    const room = singletonChatRooms.getRoom(body.roomId);
    if (!room) {
      console.warn(`Client ${wrapper.user_id} to NOENT roomId:${body.roomId}`);
      return Result.Ok({
        recipients: [wrapper.user_id],
        funcId: wrapper.funcId,
        payload: {
          message: `No such room (ID: ${body.roomId}) or you are not in it.`,
        },
      });
    }
    return room.sendMessage(body, wrapper);
  }
);

socket.registerEvent(
  user_url.ws.chat.addRoom,
  async (body: TypeAddRoomPayloadSchema, wrapper: T_ForwardToContainer) => {
    const room = singletonChatRooms.addRoom(body, wrapper);
    if (!room) {
      console.error(
        "Unhandled exception; adding a room always succeeds. (kheh)"
      );
      return Result.Ok({
        recipients: [wrapper.user_id],
        funcId: wrapper.funcId,
        payload: {
          message: `Could not create requested room by name: ${body.roomName}`,
        },
      });
    }
    return room;
  }
);
