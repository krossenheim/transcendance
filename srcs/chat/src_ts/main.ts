"use strict";
import { OurSocket } from "./utils/socket_to_hub.js";
import Fastify from "fastify";
import ChatRooms from "./roomClass.js";
import websocketPlugin from "@fastify/websocket";
import { Result } from "./utils/api/service/common/result.js";
import { int_url, user_url } from "./utils/api/service/common/endpoints.js";
import { createFastify } from "./utils/api/service/common/fastify.js";
import containers from "./utils/internal_api.js";
import {
  ChatRoomType,
  type TypeEmptySchema,
  type TypeUserSendMessagePayload,
} from "./utils/api/service/chat/chat_interfaces.js";
import { FullRoomInfoSchema, type TypeFullRoomInfoSchema } from "./utils/api/service/chat/db_models.js";

const fastify = createFastify();
const socket = new OurSocket("chat");
const singletonChatRooms = new ChatRooms();

import { chatEndpoints } from "./fastifyEndpoints.js";
chatEndpoints(fastify, singletonChatRooms, socket);

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

socket.registerHandler(user_url.ws.chat.sendDirectMessage, async (wrapper) => {
  const users = await containers.db.fetchMultipleUsers([wrapper.user_id, wrapper.payload.targetUserId]);
  if (users.isErr()) {
    console.error("Failed to fetch users for DM:", users.unwrapErr());
    return Result.Ok({
      recipients: [wrapper.user_id],
      funcId: wrapper.funcId,
      code: user_url.ws.chat.sendDirectMessage.schema.output.UserNotFound.code,
      payload: {
        message: `User not found or failed to create DM room`,
      },
    });
  }

  const requester = users.unwrap().find(u => u.id === wrapper.user_id);
  const target = users.unwrap().find(u => u.id === wrapper.payload.targetUserId);

  if (!requester || !target || requester.accountType === 0 || target.accountType === 0) {
    console.error("One of the users is invalid or forbidden for DM.");
    return Result.Ok({
      recipients: [wrapper.user_id],
      funcId: wrapper.funcId,
      code: user_url.ws.chat.sendDirectMessage.schema.output.UserNotFound.code,
      payload: {
        message: `User not found or failed to create DM room`,
      },
    });
  }

  const message_string = wrapper.payload.messageString;

  const dmResult = await singletonChatRooms.getOrCreateDMRoom(requester.id, target.id);
  if (dmResult.isErr()) {
    console.error("Failed to create/get DM room");
    return Result.Ok({
      recipients: [requester.id],
      funcId: wrapper.funcId,
      code: user_url.ws.chat.sendDirectMessage.schema.output.UserNotFound.code,
      payload: {
        message: `User not found or failed to create DM room`,
      },
    });
  }

  const roomResult = dmResult.unwrap();
  if (roomResult.created)
    await socket.invokeHandler(user_url.ws.chat.listRooms, [requester.id, target.id], {});

  await socket.invokeHandler(user_url.ws.chat.sendMessage, requester.id, {
    roomId: roomResult.room.getId(),
    messageString: message_string,
  });

  return Result.Ok({
    recipients: [requester.id],
    code: 0,
    payload: {
      roomId: roomResult.room.getId(),
    },
  })
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

  if (room.getRoomType && room.getRoomType() === ChatRoomType.DIRECT_MESSAGE) {
    return Result.Ok({
      recipients: [user_id],
      code: user_url.ws.chat.addUserToRoom.schema.output.FailedToAddUser.code,
      payload: { message: "Cannot invite users into a direct message room." },
    });
  }

  const user_to_add = wrapper.payload.user_to_add;
  const result = await room.addToRoom(user_id, user_to_add);

  if (result.isOk()) {
    const response = result.unwrap();
    if (response.code === user_url.ws.chat.addUserToRoom.schema.output.UserAdded.code) {
      console.log(`[addUserToRoom] User ${user_to_add} added successfully, sending room list update`);
      await socket.invokeHandler(user_url.ws.chat.listRooms, user_to_add, {});
    }
  }
  
  return result;
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
  return await singletonChatRooms.userJoinRoom(room_id_requested, user_id, socket);
});

const port = parseInt(
  process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || "3000",
  10
);
const host = process.env.AUTH_BIND_TO || "0.0.0.0";

fastify.listen({ port, host }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`Server listening at ${address}`);
});