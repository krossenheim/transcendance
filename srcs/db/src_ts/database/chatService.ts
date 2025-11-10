import { ChatRoomUserAccessType } from "../utils/api/service/chat/db_models.js";
import { ChatRoomType } from "../utils/api/service/chat/chat_interfaces.js";
import { Result } from "../utils/api/service/common/result.js";
import { Database } from "./database.js";
import {
  StoredMessageSchema,
  RoomSchema,
  RoomUserConnectionSchema
} from "../utils/api/service/chat/db_models.js";
import type {
  TypeStoredMessageSchema,
  TypeFullRoomInfoSchema,
  TypeRoomUserConnectionSchema,
} from "../utils/api/service/chat/db_models.js";
import type { TypeRoomSchema } from "../utils/api/service/chat/db_models.js";
import { userService } from "../main.js";
import { userIdValue } from "../utils/api/service/common/zodRules.js";
import type { PublicUserDataType } from "../utils/api/service/db/user.js";

const storedMessagesTableName = "messages";
const storedRoomsTableName = "rooms";

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
    return userService.fetchUsersByIds(userIds);
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
    // try {
      const userConnections = this.getRoomUserConnections(roomId).unwrap();
      return Result.Ok({
        room: this.getRawRoomInfo(roomId).unwrap(),
        messages: this.getRoomMessages(roomId, 100).unwrap(),
        userConnections,
        users: this.getRoomUsers(userConnections).unwrap(),
      });
    // } catch (e) {
      // return Result.Err((e as Error).message);
    // }
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
