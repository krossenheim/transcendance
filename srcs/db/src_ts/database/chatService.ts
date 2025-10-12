import type {
  FullUserType,
  UserType,
  FriendType,
  UserAuthDataType,
} from "../utils/api/service/db/user.js";
import {
  User,
  FullUser,
  Friend,
  UserAuthData,
} from "../utils/api/service/db/user.js";
import type { GameResultType } from "../utils/api/service/db/gameResult.js";
import { GameResult } from "../utils/api/service/db/gameResult.js";
import { Result } from "../utils/api/service/common/result.js";
import { Database } from "./database.js";
import { z } from "zod";
import {
  ROOMNAME_MAX_LEN,
  MESSAGE_MAX_LEN,
} from "../utils/api/service/chat/chat_interfaces.js";
import {
  StoredMessageSchema,
  ListRoomsSchema,
} from "../utils/api/service/chat/db_models.js";
import type {
  TypeStoredMessageSchema,
  TypeListRoomsSchema,
} from "../utils/api/service/chat/db_models.js";
import { NoService } from "../database/noService.js";
import type {TypeRoomSchema} from "../utils/api/service/chat/db_models.js";

const storedMessagesTableName = "messages";
const storedRoomsTableName = "rooms";

export class ChatService {
  private db: Database;
  constructor(db: Database) {
    this.db = db;
  }

  getRoomDetails(
    room_name: string
  ): Result<Array<TypeStoredMessageSchema>, string> {
    return this.db.all(
      `SELECT userId, messageString, messageDate FROM ${storedRoomsTableName} WHERE room_name = ?`,
      StoredMessageSchema,
      [room_name]
    );
  }

  getRoomList(
    room_name: string
  ): Result<Array<TypeStoredMessageSchema>, string> {
    return this.db.all(
      `SELECT userId, messageString, messageDate FROM ${storedRoomsTableName} WHERE room_name = ?`,
      StoredMessageSchema,
      [room_name]
    );
  }

  createNewRoom(roomName: string): Result<TypeRoomSchema, string> {
	return this.db.run(
		`INSERT INTO chat_rooms (roomName) VALUES (?)`,
		[roomName]
	)
  }
}
