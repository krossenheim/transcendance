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
import { StoredMessageSchema } from "../utils/api/service/chat/chat_interfaces.js";
type TypeStoredMessageSchema = z.infer<typeof StoredMessageSchema>;
import { NoService } from "../database/noService.js";

function getMessagesTableSqlString(table_name: string) {
  const createChatServiceTableSQL = `
CREATE TABLE IF NOT EXISTS ${table_name} (
  userId INTEGER NOT NULL,
  roomName VARCHAR(${ROOMNAME_MAX_LEN}) NOT NULL UNIQUE,
  messageString VARCHAR(${MESSAGE_MAX_LEN}) NOT NULL,
  messageDate INTEGER DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (userId),
  FOREIGN KEY(userId) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
) STRICT;
`;
  return createChatServiceTableSQL;
}

export class ChatService {
  private db: DatabaseSync;
  static readonly service_name = process.env.CHATROOM_NAME;
  public readonly messagesTableName = "chat_service";
  private constructor(db: DatabaseSync) {
    this.db = db;
  }

  static create(db: DatabaseSync): Result<ChatService, NoService> {
    const service = new ChatService(db);
    try {
      service.ensureMessagesTableInDb();
      return Result.Ok(service);
    } catch (err: any) {
      console.error(
        "Initialization error: Table could not created, or there is a model mismatch."
      );
      if (!ChatService.service_name) {
        throw Error(
          "Missing enviroment variable for service name see globals.env"
        );
      }
	  // Will reply to any method with "No service ChatService.service_name"
      return Result.Err(new NoService(ChatService.service_name));
    }
  }

  getUsersInRoom(
    room_name: string
  ): Result<Array<TypeStoredMessageSchema>, string> {
    const sql = `SELECT userId, messageString, messageDate FROM ${this.messagesTableName} WHERE room_name = ?`;
    let result;
    try {
      result = z
        .array(StoredMessageSchema)
        .safeParse(this.db.prepare(sql).all(room_name));
      if (!result.success) {
        const errstr = `Table ${this.messagesTableName} has entries not matching schema StoredMessageSchema`;
        return Result.Err(errstr);
      }
    } catch (err) {
      return Result.Err(`"Sql error:${err}"`);
    }
    return Result.Ok(result.data);
  }

  getRoomMessages(
    room_name: string
  ): Result<Array<TypeStoredMessageSchema>, string> {
    const sql = `SELECT userId, messageString, messageDate FROM ${this.messagesTableName} WHERE room_name = ?`;
    let result;
    try {
      result = z
        .array(StoredMessageSchema)
        .safeParse(this.db.prepare(sql).all(room_name));
      if (!result.success) {
        const errstr = `Table ${this.messagesTableName} has entries not matching schema StoredMessageSchema`;
        return Result.Err(errstr);
      }
    } catch (err) {
      return Result.Err(`"Sql error:${err}"`);
    }
    return Result.Ok(result.data);
  }

  ensureMessagesTableMatchesSchema(): Result<boolean, string> {
    // This will throw if a model was changed and the database not migrated.
    // Which is good because its not like we auto migrate.
    const sql = `SELECT * FROM ${this.messagesTableName}`;
    let result;
    try {
      result = z
        .array(StoredMessageSchema)
        .safeParse(this.db.prepare(sql).all());
    } catch (err) {
      return Result.Err(`"Sql error:${err}"`);
    }
    if (!result.success) {
      const errstr = `Table ${this.messagesTableName} has entries not matching schema StoredMessageSchema`;
      return Result.Err(errstr);
    }
    return Result.Ok(true);
  }

  ensureMessagesTableInDb(): Result<true, string> {
    const sql = `CREATE TABLE IF NOT EXISTS ${this.messagesTableName} (
				userId INTEGER NOT NULL,
				roomName VARCHAR(${ROOMNAME_MAX_LEN}) NOT NULL UNIQUE,
				messageString VARCHAR(${MESSAGE_MAX_LEN}) NOT NULL,
				messageDate INTEGER DEFAULT (strftime('%s', 'now')),
				PRIMARY KEY (userId),
				FOREIGN KEY(userId) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
				) STRICT;`;
    let result = null;
    try {
      result = this.db.prepare(sql).run();
    } catch (err) {
      return Result.Err(`"Sql error:${err}"`);
    }

    // Will throw in cases where we misconfigured something or modified schemas without updating everyone
    this.ensureMessagesTableMatchesSchema();

    console.log("Successfully queried:\n", sql);
    return Result.Ok(true);
  }

  //   fetchUserGameResults(userId: number): GameResultType[] {
  //     const stmt = this.db.prepare(
  //       `SELECT * FROM player_game_results WHERE userId = ?`
  //     );
  //     const result = z.array(GameResult).safeParse(stmt.all(userId));
  //     if (!result.success) {
  //       console.error("Failed to fetch user game results:", result.error);
  //       return [];
  //     }
  //     return result.data;
  //   }

  //   fetchUserById(id: number): Result<FullUserType, string> {
  //     const stmt = this.db.prepare(`
  // 			SELECT id, createdAt, username, alias, email, isGuest FROM users WHERE id = ?
  // 		`);
  //     console.log(stmt);
  //     const user = User.safeParse(stmt.get(id));
  //     console.log(user);
  //     if (!user.success) return Result.Err("User not found");

  //     const parsed = FullUser.safeParse({
  //       ...user.data,
  //       friends: this.fetchUserFriendlist(user.data),
  //     });

  //     if (!parsed.success) return Result.Err("Failed to parse user data");
  //     return Result.Ok(parsed.data);
  //   }

  //   createNewUser(
  //     username: string,
  //     email: string,
  //     passwordHash: string | null
  //   ): Result<FullUserType, string> {
  //     console.log("Creating user in database:", username, email);
  //     const stmt = this.db.prepare(`
  // 			INSERT INTO users (username, email, passwordHash, isGuest) VALUES (?, ?, ?, ?)
  // 		`);
  //     const info = stmt.run(username, email, passwordHash, 0);
  //     return this.fetchUserById(Number(info.lastInsertRowid));
  //   }

  //   createNewGuestUser(): Result<FullUserType, string> {
  //     let max_tries = 5;

  //     while (max_tries-- > 0) {
  //       const username = createGuestUsername();
  //       const stmt = this.db.prepare(`
  // 				INSERT INTO users (username, email, passwordHash, isGuest) VALUES (?, ?, ?, ?)
  // 			`);
  //       try {
  //         const info = stmt.run(username, `${username}@example.com`, null, 1);
  //         return this.fetchUserById(Number(info.lastInsertRowid));
  //       } catch (error) {}
  //     }

  //     return Result.Err("Failed to create unique guest username");
  //   }

  //   fetchUserFromUsername(username: string): Result<UserAuthDataType, string> {
  //     const stmt = this.db.prepare(`
  // 			SELECT id, passwordHash, isGuest FROM users WHERE username = ?
  // 		`);
  //     const parsed = UserAuthData.safeParse(stmt.get(username));
  //     if (!parsed.success) return Result.Err("Username not found");
  //     return Result.Ok(parsed.data);
  //   }
}
