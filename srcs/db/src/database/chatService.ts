import { ChatRoomUserAccessType } from "@app/shared/api/service/chat/db_models";
import { ChatRoomType } from "@app/shared/api/service/chat/chat_interfaces";
import { Result } from "@app/shared/api/service/common/result";
import { Database } from "./database.js";
import {
  StoredMessageSchema,
  RoomSchema,
  RoomUserConnectionSchema
} from "@app/shared/api/service/chat/db_models";
import type {
  TypeStoredMessageSchema,
  TypeFullRoomInfoSchema,
  TypeRoomUserConnectionSchema,
} from "@app/shared/api/service/chat/db_models";
import type { TypeRoomSchema } from "@app/shared/api/service/chat/db_models";
import { userService } from "../main.js";
import { z } from "zod";
import type { PublicUserDataType } from "@app/shared/api/service/db/user";

export class ChatService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  setUserRoomAccessType(userId: number, roomId: number, userState: number): Result<null, string> {
    return this.db.run(
      `INSERT INTO users_room_relationships (roomId, userId, userState)
       VALUES (?, ?, ?)
       ON CONFLICT(roomId, userId) DO UPDATE SET userState=excluded.userState`,
      [roomId, userId, userState]
    ).map(() => null);
  }

  inviteUserToRoom(userId: number, roomId: number): Result<null, string> {
    return this.setUserRoomAccessType(userId, roomId, ChatRoomUserAccessType.INVITED);
  }

  addUserToRoom(userId: number, roomId: number): Result<null, string> {
    return this.setUserRoomAccessType(userId, roomId, ChatRoomUserAccessType.JOINED);
  }

  removeUserFromRoom(userId: number, roomId: number): Result<null, string> {
    return this.db.run(
      `DELETE FROM users_room_relationships WHERE roomId = ? AND userId = ?`,
      [roomId, userId]
    ).map(() => null);
  }

  createNewRoom(roomName: string, roomType: ChatRoomType, owner: number): Result<TypeRoomSchema, string> {
    const roomCreationResult = this.db.run(
      `INSERT INTO chat_rooms (roomType, roomName) VALUES (?, ?)`,
      [roomType, roomName]
    ).map((info) => ({ roomId: Number(info.lastInsertRowid), roomName, roomType }));

    if (roomCreationResult.isErr())
      return roomCreationResult;

    if (this.addUserToRoom(owner, roomCreationResult.unwrap().roomId).isErr()) {
      return Result.Err("Could not add owner to newly created room.");
    }

    return roomCreationResult;
  }

  getRawRoomInfo(roomId: number): Result<TypeRoomSchema, string> {
    return this.db.get(
      `SELECT roomId, roomType, roomName FROM chat_rooms WHERE roomId = ?`,
      RoomSchema,
      [roomId]
    );
  }

  getRoomMessages(roomId: number, limit: number): Result<TypeStoredMessageSchema[], string> {
    return this.db.all(
      `SELECT messageId, roomId, messageString, messageDate, userId FROM chat_messages WHERE roomId = ? ORDER BY messageDate ASC LIMIT ?`,
      StoredMessageSchema,
      [roomId, limit]
    );
  }

  getRoomUserConnections(roomId: number): Result<TypeRoomUserConnectionSchema[], string> {
    return this.db.all(
      `SELECT userId, userState FROM users_room_relationships WHERE roomId = ?`,
      RoomUserConnectionSchema,
      [roomId]
    );
  }

  getRoomUsers(userConnections: TypeRoomUserConnectionSchema[]): Result<PublicUserDataType[], string> {
    const userIds = userConnections.map((conn) => conn.userId);
    return userService.fetchPublicUsersByIds(userIds);
  }

  getUserRooms(userId: number): Result<TypeRoomSchema[], string> {
    return this.db.all(
      `SELECT r.roomId, r.roomType, r.roomName
       FROM chat_rooms r
       JOIN users_room_relationships rc ON r.roomId = rc.roomId
       WHERE rc.userId = ?`,
      RoomSchema,
      [userId]
    );
  }

  fetchRoomById(roomId: number): Result<TypeFullRoomInfoSchema, string> {
    try {
      const userConnections = this.getRoomUserConnections(roomId).unwrap();
      return Result.Ok({
        room: this.getRawRoomInfo(roomId).unwrap(),
        messages: this.getRoomMessages(roomId, 100).unwrap(),
        userConnections,
        users: this.getRoomUsers(userConnections).unwrap(),
      });
    } catch (e) {
      return Result.Err((e as Error).message);
    }
  }

  fetchDMRoom(userA: number, userB: number): Result<{ room: TypeFullRoomInfoSchema, created: boolean }, string> {
    let userOneId = userA < userB ? userA : userB;
    let userTwoId = userA < userB ? userB : userA;

    const existingRoomResult = this.db.get(
      `SELECT roomId FROM dm_chat_rooms_mapping WHERE (userOneId = ? AND userTwoId = ?)`,
      z.number().int(),
      [userOneId, userTwoId]
    );

    if (existingRoomResult.isOk()) {
      const roomId = existingRoomResult.unwrap();
      return this.fetchRoomById(roomId).map(room => ({ room, created: false }));
    }

    const roomCreationResult = this.createNewRoom(`DM ${userOneId} ${userTwoId}`, ChatRoomType.DIRECT_MESSAGE, userOneId);
    if (roomCreationResult.isErr())
      return Result.Err(roomCreationResult.unwrapErr());

    const room = roomCreationResult.unwrap();
    if (this.addUserToRoom(userTwoId, room.roomId).isErr()) {
      return Result.Err("Could not add second user to newly created DM room.");
    }
  
    const mappingCreationResult = this.db.run(
      `INSERT INTO dm_chat_rooms_mapping (userOneId, userTwoId, roomId) VALUES (?, ?, ?)`,
      [userOneId, userTwoId, room.roomId]
    );

    if (mappingCreationResult.isErr())
      return Result.Err("Could not create DM room mapping.");

    return this.fetchRoomById(room.roomId).map(room => ({ room, created: true }));
  }

  sendMessageToRoom(roomId: number, userId: number, messageString: string): Result<TypeStoredMessageSchema, string> {
    return this.db.run(
      `INSERT INTO chat_messages (roomId, userId, messageString, messageDate)
       VALUES (?, ?, ?, strftime('%s', 'now'))`,
      [roomId, userId, messageString]
    ).map((context) => {
      const messageId = Number(context.lastInsertRowid);
      const messageDate = Math.floor(Date.now() / 1000);
      return {
        messageId,
        roomId,
        userId,
        messageString,
        messageDate,
      };
    });
  }
}
