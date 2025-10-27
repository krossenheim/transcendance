"use strict";
import { OurSocket } from "./utils/socket_to_hub.js";
import Fastify from "fastify";
import ChatRooms from "./roomClass.js";
import websocketPlugin from "@fastify/websocket";
import { Result } from "./utils/api/service/common/result.js";
import { user_url } from "./utils/api/service/common/endpoints.js";

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

const socket = new OurSocket("chat");
const singletonChatRooms = new ChatRooms();
socket.registerHandler(
  user_url.ws.chat.sendMessage,
  async (body) => {
    const room = singletonChatRooms.getRoom(body.payload.roomId);
    if (!room) {
      console.warn(
        `Client ${body.user_id} to NOENT roomId:${body.payload.roomId}`
      );
      return Result.Ok({
        recipients: [body.user_id],
        funcId: body.funcId,
        code: user_url.ws.chat.sendMessage.schema.output.NotInRoom.code,
        payload: {
          message: `No such room (ID: ${body.payload.roomId}) or you are not in it.`,
        },
      });
    }
    return room.sendMessage(body);
  }
);

socket.registerHandler(
  user_url.ws.chat.addUserToRoom,
  async (body, schema) => {
    const room = singletonChatRooms.getRoom(body.payload.roomId);
    if (!room) {
      console.warn(`Bad user request, no such room.`);
      return Result.Ok({
        recipients: [body.user_id],
        code: schema.output.NoSuchRoom.code,
        payload: {
          message: `No such room (ID: ${body.payload.roomId}) or you are not in it.`,
        },
      });
    }
    return room.addToRoom(body);
  }
);

socket.registerHandler(
  user_url.ws.chat.addRoom,
  async (body) => {
    const room = singletonChatRooms.addRoom(body);
    if (!room) {
      console.error("Mega warning, could not add a room.");
      return Result.Ok({
        recipients: [body.user_id],
        funcId: body.funcId,
        code: user_url.ws.chat.addRoom.schema.output.FailedToAddRoom.code,
        payload: {
          message: `Could not create requested room by name: ${body.payload.roomName}`,
        },
      });
    }
    return room;
  }
);

socket.registerHandler(
  user_url.ws.chat.listRooms,
  async (body) => {
    const roomList = singletonChatRooms.listRooms(body);
    if (roomList.isErr()) {
      console.error(
        "Mega warning, could not list rooms for an user:",
        body.user_id
      );
      return Result.Ok({
        recipients: [body.user_id],
        code: user_url.ws.chat.listRooms.schema.output.NoListGiven.code,
        payload: {
          message: `Could not list the rooms you can join.`,
        },
      });
    }
    return roomList;
  }
);
socket.registerHandler(
  user_url.ws.chat.joinRoom,
  async (body) => {
    return singletonChatRooms.userJoinRoom(body);
  }
);
