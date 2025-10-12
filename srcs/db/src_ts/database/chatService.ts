import { Result } from "../utils/api/service/common/result.js";
import { Database } from "./database.js";
import {
  StoredMessageSchema,
} from "../utils/api/service/chat/db_models.js";
import type {
  TypeStoredMessageSchema,
} from "../utils/api/service/chat/db_models.js";
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
    ).map((info) => ({ roomId: Number(info.lastInsertRowid), roomName }));
  }
}
