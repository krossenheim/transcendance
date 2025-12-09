"use strict";
import { ChatRoomType } from "@app/shared/api/service/chat/chat_interfaces";
import { createFastify } from "@app/shared/api/service/common/fastify";
import { user_url } from "@app/shared/api/service/common/endpoints";
import { Result } from "@app/shared/api/service/common/result";
import { OurSocket } from "@app/shared/socket_to_hub";

import containers from "@app/shared/internal_api";
import ChatRooms from "./roomClass";

const fastify = createFastify();
const socket = new OurSocket("chat");
const singletonChatRooms = new ChatRooms();

import { chatEndpoints } from "./fastifyEndpoints.js";
chatEndpoints(fastify, singletonChatRooms, socket);

socket.registerHandler(user_url.ws.chat.sendMessage, async (body, response) => {
  const room = singletonChatRooms.getRoom(body.payload.roomId);
  const user_id = body.user_id;
  if (!room) {
    console.warn(`Client ${user_id} to NOENT roomId:${body.payload.roomId}`);
    return Result.Ok(response.select("NotInRoom").reply({
      message: `No such room (ID: ${body.payload.roomId}) or you are not in it.`,
    }));
  }
  const room_id_requested = body.payload.roomId;
  const message_string = body.payload.messageString;
  return await room.sendMessage(user_id, room_id_requested, message_string);
});

socket.registerHandler(user_url.ws.chat.sendDirectMessage, async (body, response) => {
  const users = await containers.db.fetchMultipleUsers([body.user_id, body.payload.targetUserId]);
  if (users.isErr()) {
    console.error("Failed to fetch users for DM:", users.unwrapErr());
    return Result.Ok(response.select("UserNotFound").reply({
      message: `User not found or failed to create DM room`,
    }));
  }

  const requester = users.unwrap().find(u => u.id === body.user_id);
  const target = users.unwrap().find(u => u.id === body.payload.targetUserId);

  if (!requester || !target || requester.accountType === 0 || target.accountType === 0) {
    console.error("One of the users is invalid or forbidden for DM.");
    return Result.Ok(response.select("UserNotFound").reply({
      message: `User not found or failed to create DM room`,
    }));
  }

  const message_string = body.payload.messageString;
  const dmResult = await singletonChatRooms.getOrCreateDMRoom(requester.id, target.id);
  if (dmResult.isErr()) {
    console.error("Failed to create/get DM room");
    return Result.Ok(response.select("UserNotFound").reply({
      message: `User not found or failed to create DM room`,
    }));
  }

  const roomResult = dmResult.unwrap();
  if (roomResult.created)
    await socket.invokeHandler(user_url.ws.chat.listRooms, [requester.id, target.id], {});

  await socket.invokeHandler(user_url.ws.chat.sendMessage, requester.id, {
    roomId: roomResult.room.getId(),
    messageString: message_string,
  });

  return Result.Ok(response.select("MessageSent").reply({
    roomId: roomResult.room.getId(),
  }));
});

socket.registerHandler(user_url.ws.chat.addUserToRoom, async (body, response) => {
  const room_id_requested = body.payload.roomId;
  const room = singletonChatRooms.getRoom(room_id_requested);
  const user_id = body.user_id;
  if (!room) {
    console.warn(`Bad user request, no such room.`);
    return Result.Ok(response.select("NoSuchRoom").reply({
      message: `No such room (ID: ${room_id_requested}) or you are not in it.`,
    }));
  }

  if (room.getRoomType && room.getRoomType() === ChatRoomType.DIRECT_MESSAGE) {
    return Result.Ok(response.select("FailedToAddUser").reply({
      message: "Cannot invite users into a direct message room.",
    }));
  }

  const user_to_add = body.payload.user_to_add;
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

socket.registerHandler(user_url.ws.chat.addRoom, async (body, response) => {
  const room_name_requested = body.payload.roomName;
  const user_id = body.user_id;
  const room = await singletonChatRooms.addRoom(room_name_requested, user_id);
  if (!room) {
    console.error("Mega warning, could not add a room.");
    return Result.Ok(response.select("FailedToAddRoom").reply({
      message: `Could not create requested room by name: ${room_name_requested}`,
    }));
  }
  return room;
});

socket.registerHandler(user_url.ws.chat.getRoomData, async (body, response) => {
  const room_id_requested = body.payload.roomId;
  const user_id = body.user_id;
  const roomInfoResult = await singletonChatRooms.fetchRoomById(room_id_requested, user_id);
  if (roomInfoResult.isErr()) {
    console.error("Mega warning, could not get room data for room:", room_id_requested);
    return Result.Ok(response.select("NoSuchRoom").reply({
      message: `Could not get data for room ID: ${room_id_requested}`,
    }));
  }

  return roomInfoResult;
});

socket.registerHandler(user_url.ws.chat.listRooms, async (body, response) => {
  const user_id = body.user_id;
  const roomList = await singletonChatRooms.listRooms(user_id);
  if (roomList.isErr()) {
    console.error("Mega warning, could not list rooms for an user:", user_id);
    return Result.Ok(response.select("NoListGiven").reply({
      message: `Could not list the rooms you can join.`,
    }));
  }
  return roomList;
});

socket.registerHandler(user_url.ws.chat.joinRoom, async (body) => {
  const room_id_requested = body.payload.roomId;
  const user_id = body.user_id;
  return await singletonChatRooms.userJoinRoom(room_id_requested, user_id, socket);
});

socket.registerHandler(user_url.ws.chat.leaveRoom, async (body) => {
  const room_id_requested = body.payload.roomId;
  const user_id = body.user_id;
  return await singletonChatRooms.userLeaveRoom(room_id_requested, user_id, socket);
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