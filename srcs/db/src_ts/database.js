"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_sqlite_1 = require("node:sqlite");
const zod_1 = require("zod");
const db_interfaces_js_1 = __importDefault(require("./utils/api/service/db_interfaces.js"));
class Database {
    db;
    constructor(dbPath = 'inception.db') {
        this.db = new node_sqlite_1.DatabaseSync(dbPath);
        this._initializeTables();
        this.db.exec('PRAGMA foreign_keys = ON');
    }
    _initializeTables() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        createdAt INTEGER DEFAULT (strftime('%s', 'now')),
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        passwordHash TEXT DEFAULT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS player_game_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        score INTEGER NOT NULL,
        rank INTEGER NOT NULL,
        FOREIGN KEY(userId) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
      ) STRICT;
    `);
    }
    fetchAllUsers() {
        const result = zod_1.z.array(db_interfaces_js_1.default.UserSchema).safeParse(this.db.prepare(`
			SELECT id, createdAt, username, email FROM users
		`).all());
        if (!result.success) {
            console.error('Failed to fetch users:', result.error);
            return [];
        }
        return result.data.map((user) => ({
            ...user,
            gameResults: this.fetchUserGameResults(user.id)
        }));
    }
    fetchUserGameResults(userId) {
        const stmt = this.db.prepare(`SELECT * FROM player_game_results WHERE userId = ?`);
        const result = zod_1.z.array(db_interfaces_js_1.default.GameResultSchema).safeParse(stmt.all(userId));
        if (!result.success) {
            console.error('Failed to fetch user game results:', result.error);
            return [];
        }
        return result.data;
    }
    fetchUserById(id) {
        const stmt = this.db.prepare(`
			SELECT id, createdAt, username, email FROM users WHERE id = ?
		`);
        const user = db_interfaces_js_1.default.UserSchema.safeParse(stmt.get(id));
        if (!user.success)
            return undefined;
        return db_interfaces_js_1.default.FullUserSchema.safeParse({
            ...user.data,
            gameResults: this.fetchUserGameResults(id),
        }).data;
    }
    createNewUser(username, email, passwordHash) {
        console.log('Creating user in database:', username, email);
        const stmt = this.db.prepare(`
			INSERT INTO users (username, email, passwordHash) VALUES (?, ?, ?)
		`);
        const info = stmt.run(username, email, passwordHash);
        return this.fetchUserById(Number(info.lastInsertRowid));
    }
    fetchUserFromCredentials(username, passwordHash) {
        const stmt = this.db.prepare(`
			SELECT * FROM users WHERE username = ? AND passwordHash = ?
		`);
        return db_interfaces_js_1.default.UserSchema.safeParse(stmt.get(username, passwordHash)).data;
    }
    close() {
        this.db.close();
    }
}
exports.default = Database;
//# sourceMappingURL=database.js.map