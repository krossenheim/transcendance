"use strict";
import { socketToHub, OurSocket } from "./utils/socket_to_hub.js";
import Fastify from "fastify";
import ChatRooms from "./roomClass.js";
import websocketPlugin, { type WebsocketHandler } from "@fastify/websocket";
import type { T_ForwardToContainer } from "./utils/api/service/hub/hub_interfaces.js";
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

const socket = new OurSocket(socketToHub, "chat");
const singletonChatRooms = new ChatRooms();
socket.registerEvent(
  user_url.ws.chat.sendMessage,
  async (wrapper: T_ForwardToContainer) => {
    const room = singletonChatRooms.getRoom(wrapper.payload.roomId);
    if (!room) {
      console.warn(
        `Client ${wrapper.user_id} to NOENT roomId:${wrapper.payload.roomId}`
      );
      return Result.Ok({
        recipients: [wrapper.user_id],
        funcId: wrapper.funcId,
        code: user_url.ws.chat.sendMessage.code.NoSuchRoom,
        payload: {
          message: `No such room (ID: ${wrapper.payload.roomId}) or you are not in it.`,
        },
      });
    }
    return room.sendMessage(wrapper);
  }
);

socket.registerEvent(
  user_url.ws.chat.addUserToRoom,
  async (wrapper: T_ForwardToContainer) => {
    const room = singletonChatRooms.getRoom(wrapper.payload.roomId);
    if (!room) {
      console.warn(`Bad user request, no such room.`);
      return Result.Ok({
        recipients: [wrapper.user_id],
        funcId: wrapper.funcId,
        code: user_url.ws.chat.addUserToRoom.code.NoSuchRoom,
        payload: {
          message: `No such room (ID: ${wrapper.payload.roomId}) or you are not in it.`,
        },
      });
    }
    return room.addToRoom(wrapper);
  }
);

socket.registerEvent(
  user_url.ws.chat.addRoom,
  async (wrapper: T_ForwardToContainer) => {
    const room = singletonChatRooms.addRoom(wrapper);
    if (!room) {
      console.error("Mega warning, could not add a room.");
      return Result.Ok({
        recipients: [wrapper.user_id],
        funcId: wrapper.funcId,
        code: user_url.ws.chat.addRoom.code.ErrorNoRoomAdded,
        payload: {
          message: `Could not create requested room by name: ${wrapper.payload.roomName}`,
        },
      });
    }
    return room;
  }
);

socket.registerEvent(
  user_url.ws.chat.listRooms,
  async (wrapper: T_ForwardToContainer) => {
    const roomList = singletonChatRooms.listRooms(wrapper);
    if (roomList.isErr()) {
      console.error(
        "Mega warning, could not list rooms for an user:",
        wrapper.user_id
      );
      return Result.Ok({
        recipients: [wrapper.user_id],
        funcId: wrapper.funcId,
        code: user_url.ws.chat.listRooms.code.NoListGiven,
        payload: {
          message: `Could not list the rooms you can join.`,
        },
      });
    }
    return roomList;
  }
);
socket.registerEvent(
  user_url.ws.chat.joinRoom,
  async (wrapper: T_ForwardToContainer) => {
    return singletonChatRooms.userJoinRoom(wrapper);
  }
);
