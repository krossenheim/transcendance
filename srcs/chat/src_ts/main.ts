"use strict";
import { OurSocket } from "./utils/socket_to_hub.js";
import Fastify from "fastify";
import ChatRooms from "./roomClass.js";
import websocketPlugin from "@fastify/websocket";
import { Result } from "./utils/api/service/common/result.js";
import { int_url, user_url } from "./utils/api/service/common/endpoints.js";
import {
  type TypeEmptySchema,
  type TypeUserSendMessagePayload,
} from "./utils/api/service/chat/chat_interfaces.js";
import { FullRoomInfoSchema, type TypeFullRoomInfoSchema } from "./utils/api/service/chat/db_models.js";

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
socket.registerHandler(user_url.ws.chat.sendMessage, async (wrapper) => {
  const room = singletonChatRooms.getRoom(wrapper.payload.roomId);
  const user_id = wrapper.user_id;
  if (!room) {
    console.warn(`Client ${user_id} to NOENT roomId:${wrapper.payload.roomId}`);
    return Result.Ok({
      recipients: [user_id],
      funcId: wrapper.funcId,
      code: user_url.ws.chat.sendMessage.schema.output.NotInRoom.code,
      payload: {
        message: `No such room (ID: ${wrapper.payload.roomId}) or you are not in it.`,
      },
    });
  }
  const room_id_requested = wrapper.payload.roomId;
  const message_string = wrapper.payload.messageString;
  return await room.sendMessage(user_id, room_id_requested, message_string);
});

socket.registerHandler(user_url.ws.chat.addUserToRoom, async (wrapper) => {
  const room_id_requested = wrapper.payload.roomId;
  const room = singletonChatRooms.getRoom(room_id_requested);
  const user_id = wrapper.user_id;
  if (!room) {
    console.warn(`Bad user request, no such room.`);
    return Result.Ok({
      recipients: [user_id],
      code: user_url.ws.chat.addUserToRoom.schema.output.NoSuchRoom.code,
      payload: {
        message: `No such room (ID: ${room_id_requested}) or you are not in it.`,
      },
    });
  }
  const user_to_add = wrapper.payload.user_to_add;
  return room.addToRoom(user_id, user_to_add);
});

socket.registerHandler(user_url.ws.chat.addRoom, async (wrapper) => {
  const room_name_requested = wrapper.payload.roomName;
  const user_id = wrapper.user_id;
  const room = await singletonChatRooms.addRoom(room_name_requested, user_id);
  if (!room) {
    console.error("Mega warning, could not add a room.");
    return Result.Ok({
      recipients: [user_id],
      funcId: wrapper.funcId,
      code: user_url.ws.chat.addRoom.schema.output.FailedToAddRoom.code,
      payload: {
        message: `Could not create requested room by name: ${room_name_requested}`,
      },
    });
  }
  return room;
});

socket.registerHandler(user_url.ws.chat.getRoomData, async (wrapper) => {
  const room_id_requested = wrapper.payload.roomId;
  const user_id = wrapper.user_id;
  const roomInfoResult = await singletonChatRooms.fetchRoomById(room_id_requested, user_id);
  if (roomInfoResult.isErr()) {
    console.error("Mega warning, could not get room data for room:", room_id_requested);
    return Result.Ok({
      recipients: [user_id],
      funcId: wrapper.funcId,
      code: user_url.ws.chat.getRoomData.schema.output.NoSuchRoom.code,
      payload: {
        message: `Could not get data for room ID: ${room_id_requested}`,
      },
    });
  }

  return roomInfoResult;
});

socket.registerHandler(user_url.ws.chat.listRooms, async (wrapper) => {
  const user_id = wrapper.user_id;
  const roomList = await singletonChatRooms.listRooms(user_id);
  if (roomList.isErr()) {
    console.error("Mega warning, could not list rooms for an user:", user_id);
    return Result.Ok({
      recipients: [user_id],
      code: user_url.ws.chat.listRooms.schema.output.NoListGiven.code,
      payload: {
        message: `Could not list the rooms you can join.`,
      },
    });
  }
  return roomList;
});
socket.registerHandler(user_url.ws.chat.joinRoom, async (wrapper) => {
  const room_id_requested = wrapper.payload.roomId;
  const user_id = wrapper.user_id;
  return singletonChatRooms.userJoinRoom(room_id_requested, user_id);
});

socket.registerReceiver(int_url.ws.hub.userDisconnected, async (wrapper) => {
  if (
    wrapper.code === int_url.ws.hub.userDisconnected.schema.output.Success.code
  ) {
    console.log("Wrapper is: ", JSON.stringify(wrapper));
    const user_id = wrapper.payload.userId;
    if (!user_id) {
      console.error("No userId to handle at receiver for userDisconnect");
      // return Result.Err({ message: "No userId received at handler." });
      return Result.Ok(null);
    }
    for (const room of singletonChatRooms.rooms) {
      if (room.users.find((id) => id === user_id)) {
        const sendMessagePayload: TypeUserSendMessagePayload = {
          roomId: room.roomId,
          messageString: "User disconnected",
        };
        socket.invokeHandler(
          user_url.ws.chat.sendMessage,
          wrapper.payload.userId,
          sendMessagePayload
        );
      }
    }
  }
  return Result.Ok(null);
});

socket.registerReceiver(int_url.ws.hub.userConnected, async (wrapper) => {
  if (
    wrapper.code === int_url.ws.hub.userConnected.schema.output.Success.code
  ) {
    console.log("Wrapper is: ", JSON.stringify(wrapper));
    const emptyPayload: TypeEmptySchema = {};
    socket.invokeHandler(
      user_url.ws.chat.listRooms,
      wrapper.payload.userId,
      emptyPayload
    );
  }
  return Result.Ok(null);
});
