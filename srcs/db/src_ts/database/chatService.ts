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
import { DatabaseSync } from "node:sqlite";
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

const storedMessagesTableName = "messages";
const storedRoomsTableName = "rooms";

export class ChatService {
  private db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
  }

  getRoomDetails(
    room_name: string
  ): Result<Array<TypeStoredMessageSchema>, string> {
    const sql = `SELECT userId, messageString, messageDate FROM ${storedRoomsTableName} WHERE room_name = ?`;
    let result;
    try {
      result = z
        .array(StoredMessageSchema)
        .safeParse(this.db.prepare(sql).all(room_name));
      if (!result.success) {
        return Result.Err(result.error.message);
      }
    } catch (err) {
      console.error(`"Sql error:${err}"`);
      return Result.Err(`"Sql error"`);
    }
    return Result.Ok(result.data);
  }

  getRoomList(
    room_name: string
  ): Result<Array<TypeStoredMessageSchema>, string> {
    const sql = `SELECT userId, messageString, messageDate FROM ${storedRoomsTableName} WHERE room_name = ?`;
    let result;
    try {
      result = z
        .array(StoredMessageSchema)
        .safeParse(this.db.prepare(sql).all(room_name));
      if (!result.success) {
        const errstr = `Table ${storedRoomsTableName} has entries not matching schema StoredMessageSchema`;
        return Result.Err(errstr);
      }
    } catch (err) {
      return Result.Err(`"Sql error:${err}"`);
    }
    return Result.Ok(result.data);
  }
}
