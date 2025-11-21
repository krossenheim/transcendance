"use strict";
import { OurSocket } from "./utils/socket_to_hub.js";
import Fastify from "fastify";
import ChatRooms from "./roomClass.js";
import websocketPlugin from "@fastify/websocket";
import { Result } from "./utils/api/service/common/result.js";
import { int_url, user_url } from "./utils/api/service/common/endpoints.js";
import { createFastify } from "./utils/api/service/common/fastify.js";
import {
  type TypeEmptySchema,
  type TypeUserSendMessagePayload,
} from "./utils/api/service/chat/chat_interfaces.js";
import { FullRoomInfoSchema, type TypeFullRoomInfoSchema } from "./utils/api/service/chat/db_models.js";

const fastify = createFastify();
const socket = new OurSocket("chat");
const singletonChatRooms = new ChatRooms();

import { chatEndpoints } from "./endpoints.js";
chatEndpoints(fastify, singletonChatRooms);

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
  const sender_id = wrapper.user_id;
  const target_user_id = wrapper.payload.targetUserId;
  const message_string = wrapper.payload.messageString;

  // Validate message length
  if (!message_string || message_string.length < 1) {
    return Result.Ok({
      recipients: [sender_id],
      funcId: wrapper.funcId,
      code: user_url.ws.chat.sendDirectMessage.schema.output.MessageTooShort.code,
      payload: {
        message: `Message must be at least 1 character`,
      },
    });
  }

  // Create or get DM room for these two users
  const dmResult = await singletonChatRooms.getOrCreateDMRoom(sender_id, target_user_id);
  
  if (!dmResult.room) {
    console.error("Failed to create/get DM room");
    return Result.Ok({
      recipients: [sender_id],
      funcId: wrapper.funcId,
      code: user_url.ws.chat.sendDirectMessage.schema.output.UserNotFound.code,
      payload: {
        message: `User not found or failed to create DM room`,
      },
    });
  }

  const dm_room = dmResult.room;

  // Always send room list update to the target user so they see the DM room
  // This ensures the recipient sees the room even if they weren't online when it was created
  console.log(`[DM] Sending room list update to recipient (user ${target_user_id})`);
  await socket.invokeHandler(user_url.ws.chat.listRooms, target_user_id, {});
  
  // If room was just created, also send to sender
  if (dmResult.wasCreated) {
    console.log(`[DM] New room created, also updating sender's room list`);
    await socket.invokeHandler(user_url.ws.chat.listRooms, sender_id, {});
  }

  // Send the message in the DM room
  const result = await dm_room.sendMessage(sender_id, dm_room.getId(), message_string);
  
  if (result.isErr()) {
    return Result.Ok({
      recipients: [sender_id],
      funcId: wrapper.funcId,
      code: user_url.ws.chat.sendDirectMessage.schema.output.FailedToStoreMessage.code,
      payload: {
        message: `Failed to store message`,
      },
    });
  }

  const response = result.unwrap();
  
  // Map sendMessage response to sendDirectMessage response
  // sendDirectMessage only has codes 0-4, while sendMessage has 0-5
  // We need to map the response appropriately
  if (response.code === 0) {
    // MessageSent - return as-is but update funcId
    return Result.Ok({
      ...response,
      funcId: wrapper.funcId,
    });
  } else if (response.code === 2) {
    // MessageTooShort
    return Result.Ok({
      recipients: response.recipients,
      funcId: wrapper.funcId,
      code: user_url.ws.chat.sendDirectMessage.schema.output.MessageTooShort.code,
      payload: response.payload,
    });
  } else {
    // Any other error -> FailedToStoreMessage
    return Result.Ok({
      recipients: response.recipients,
      funcId: wrapper.funcId,
      code: user_url.ws.chat.sendDirectMessage.schema.output.FailedToStoreMessage.code,
      payload: response.payload,
    });
  }
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
  // Prevent inviting users into DM rooms (roomType 2)
  if (room.getRoomType && room.getRoomType() === 2) {
    return Result.Ok({
      recipients: [user_id],
      code: user_url.ws.chat.addUserToRoom.schema.output.FailedToAddUser.code,
      payload: { message: "Cannot invite users into a direct message room." },
    });
  }
  const user_to_add = wrapper.payload.user_to_add;
  const result = await room.addToRoom(user_id, user_to_add);
  
  // If user was successfully added, send them an updated room list
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
  return await singletonChatRooms.userJoinRoom(room_id_requested, user_id);
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
    console.log("User connected - broadcasting to all clients:", wrapper.payload.userId);
    const emptyPayload: TypeEmptySchema = {};
    await socket.invokeHandler(
      user_url.ws.chat.listRooms,
      wrapper.payload.userId,
      emptyPayload
    );
    
    // Broadcast user_connected event to ALL connected users so they can fetch the username
    const allConnectedUsers = Array.from(singletonChatRooms.getAllUsers());
    const broadcastResult = socket.sendMessage(user_url.ws.chat.userConnected, {
      recipients: allConnectedUsers,
      code: 0,
      payload: { userId: wrapper.payload.userId }
    });
    
    if (broadcastResult.isErr()) {
      console.error("Failed to broadcast user_connected:", broadcastResult.unwrapErr());
    }
  }
  return Result.Ok(null);
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