import { ChatRoomType } from "@app/shared/api/service/chat/chat_interfaces";
import type { PublicUserDataType } from "@app/shared/api/service/db/user";
import { Result } from "@app/shared/api/service/common/result";
import { Database, DatabaseError } from "./database";
import {
  StoredMessageSchema,
  RoomSchema,
  RoomUserConnectionSchema,
  ChatRoomUserAccessType
} from "@app/shared/api/service/chat/db_models";
import type {
  TypeStoredMessageSchema,
  TypeFullRoomInfoSchema,
  TypeRoomUserConnectionSchema,
  TypeRoomSchema
} from "@app/shared/api/service/chat/db_models";
import { RunResult } from "better-sqlite3";
import { userService } from "../main";

export class ChatService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  private _dbSetUserRoomAccessType(userId: number, roomId: number, userState: ChatRoomUserAccessType): Result<RunResult, DatabaseError> {
    return this.db.run(
      `INSERT INTO users_room_relationships (userId, roomId, userState)
       VALUES (?, ?, ?)
       ON CONFLICT(userId, roomId) DO UPDATE SET userState = excluded.userState`,
      [userId, roomId, userState]
    );
  }

  private _dbRemoveUserFromRoom(userId: number, roomId: number): Result<RunResult, DatabaseError> {
    return this.db.run(
      `DELETE FROM users_room_relationships WHERE roomId = ? AND userId = ?`,
      [roomId, userId]
    );
  }

  private _dbCreateNewChatRoom(roomName: string, roomType: ChatRoomType): Result<TypeRoomSchema, DatabaseError> {
    return this.db.get(
      `INSERT INTO chat_rooms (roomType, roomName) VALUES (?, ?) RETURNING *`,
      RoomSchema,
      [roomType, roomName]
    );
  }

  private _dbGetRawRoomInfo(roomId: number): Result<TypeRoomSchema, DatabaseError> {
    return this.db.get(
      `SELECT roomId, roomType, roomName FROM chat_rooms WHERE roomId = ?`,
      RoomSchema,
      [roomId]
    );
  }

  private _dbGetConnectedUsersInRoom(roomId: number): Result<TypeRoomUserConnectionSchema[], DatabaseError> {
    return this.db.all(
      `SELECT userId, userState FROM users_room_relationships WHERE roomId = ?`,
      RoomUserConnectionSchema,
      [roomId]
    );
  }

  private _dbGetRoomMessages(roomId: number, limit: number): Result<TypeStoredMessageSchema[], DatabaseError> {
    return this.db.all(
      `SELECT messageId, roomId, messageString, messageDate, userId FROM chat_messages WHERE roomId = ? ORDER BY messageDate DESC LIMIT ?`,
      StoredMessageSchema,
      [roomId, limit]
    ).map((rows) => rows.reverse());
  }

  private _dbGetAllUserRoomsWhereConnectionIsEqualTo(userId: number, connection: ChatRoomUserAccessType): Result<TypeRoomSchema[], DatabaseError> {
    return this.db.all(
      `SELECT r.roomId, r.roomType, r.roomName
       FROM chat_rooms r
       JOIN users_room_relationships rc ON r.roomId = rc.roomId
       WHERE rc.userId = ? AND rc.userState = ?`,
      RoomSchema,
      [userId, connection]
    );
  }

  private _dbGetAllRooms(): Result<TypeRoomSchema[], DatabaseError> {
    return this.db.all(
      `SELECT roomId, roomType, roomName FROM chat_rooms`,
      RoomSchema,
      []
    );
  }

  private _dbGetDMRoomForUsers(userA: number, userB: number): Result<TypeRoomSchema, DatabaseError> {
    let userOneId = userA < userB ? userA : userB;
    let userTwoId = userA < userB ? userB : userA;

    return this.db.get(
      `SELECT r.roomId, r.roomType, r.roomName
       FROM chat_rooms r
       JOIN dm_chat_rooms_mapping m ON r.roomId = m.roomId
       WHERE m.userOneId = ? AND m.userTwoId = ?`,
      RoomSchema,
      [userOneId, userTwoId]
    );
  }

  private _dbSendMessageToRoom(roomId: number, userId: number, messageString: string): Result<TypeStoredMessageSchema, DatabaseError> {
    return this.db.get(
      `INSERT INTO chat_messages (roomId, userId, messageString, messageDate)
       VALUES (?, ?, ?, strftime('%s', 'now'))
       RETURNING messageId, roomId, userId, messageString, messageDate`,
      StoredMessageSchema,
      [roomId, userId, messageString]
    );
  }

  private _utilGetRoomUsers(userConnections: TypeRoomUserConnectionSchema[]): Result<PublicUserDataType[], DatabaseError> {
    const userIds = userConnections.map(conn => conn.userId);
    return userService.fetchPublicUsersByIds(userIds);
  }

  public setUserRoomAccessType(userId: number, roomId: number, type: ChatRoomUserAccessType): Result<RunResult, DatabaseError> {
    return this._dbSetUserRoomAccessType(userId, roomId, type);
  }

  public inviteUserToRoom(userId: number, roomId: number): Result<RunResult, DatabaseError> {
    return this._dbSetUserRoomAccessType(userId, roomId, ChatRoomUserAccessType.INVITED);
  }

  public addUserToRoom(userId: number, roomId: number): Result<RunResult, DatabaseError> {
    return this._dbSetUserRoomAccessType(userId, roomId, ChatRoomUserAccessType.JOINED);
  }

  public removeUserFromRoom(userId: number, roomId: number): Result<RunResult, DatabaseError> {
    return this._dbRemoveUserFromRoom(userId, roomId);
  }

  public createNewChatRoom(roomName: string, owner: number): Result<TypeRoomSchema, DatabaseError> {
    return this.db.transaction(() => {
      const room = this._dbCreateNewChatRoom(roomName, ChatRoomType.PRIVATE).unwrap();
      return this._dbSetUserRoomAccessType(owner, room.roomId, ChatRoomUserAccessType.JOINED).map(() => room);
    })
  }

  public getRawRoomInfo(roomId: number): Result<TypeRoomSchema, DatabaseError> {
    return this._dbGetRawRoomInfo(roomId);
  }

  public getRoomMessages(roomId: number, limit: number): Result<TypeStoredMessageSchema[], DatabaseError> {
    return this._dbGetRoomMessages(roomId, limit);
  }

  public getRoomUserConnections(roomId: number): Result<TypeRoomUserConnectionSchema[], DatabaseError> {
    return this._dbGetConnectedUsersInRoom(roomId);
  }

  public getUserRooms(userId: number, connection: ChatRoomUserAccessType): Result<TypeRoomSchema[], DatabaseError> {
    return this._dbGetAllUserRoomsWhereConnectionIsEqualTo(userId, connection);
  }

  public fetchRoomById(roomId: number): Result<TypeFullRoomInfoSchema, DatabaseError> {
    try {
      const userConnections = this._dbGetConnectedUsersInRoom(roomId).unwrap();
      return Result.Ok({
        room: this._dbGetRawRoomInfo(roomId).unwrap(),
        messages: this._dbGetRoomMessages(roomId, 100).unwrap(),
        userConnections,
        users: this._utilGetRoomUsers(userConnections).unwrap(),
      });
    } catch (e) {
      console.error("Error fetching room by ID:", e);
      return Result.Err(this.db.mapErrorToDatabaseError(e));
    }
  }

  public getAllRooms(): Result<TypeFullRoomInfoSchema[], DatabaseError> {
    try {
      const baseRooms = this._dbGetAllRooms().unwrap();
      return Result.Ok(baseRooms.map((room) => this.fetchRoomById(room.roomId).unwrap()));
    } catch (e) {
      console.error("Error fetching all rooms:", e);
      return Result.Err(this.db.mapErrorToDatabaseError(e));
    }
  }

  public fetchDMRoom(userA: number, userB: number): Result<{ room: TypeFullRoomInfoSchema, created: boolean }, DatabaseError> {
    const existingRoomResult = this._dbGetDMRoomForUsers(userA, userB);
    if (existingRoomResult.isOk()) {
      const roomId = existingRoomResult.unwrap().roomId;
      return this.fetchRoomById(roomId).map(room => ({ room, created: false }));
    }

    return this.db.transaction(() => {
      const newRoom = this._dbCreateNewChatRoom(`DM ${userA} ${userB}`, ChatRoomType.DIRECT_MESSAGE).unwrap();
      this._dbSetUserRoomAccessType(userA, newRoom.roomId, ChatRoomUserAccessType.JOINED).unwrap();
      this._dbSetUserRoomAccessType(userB, newRoom.roomId, ChatRoomUserAccessType.JOINED).unwrap();
      return this.fetchRoomById(newRoom.roomId).map(room => ({ room, created: true }));
    });
  }

  sendMessageToRoom(roomId: number, userId: number, messageString: string): Result<TypeStoredMessageSchema, DatabaseError> {
    return this._dbSendMessageToRoom(roomId, userId, messageString);
  }
}
