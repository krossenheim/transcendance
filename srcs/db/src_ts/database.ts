import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import Schema from './utils/api/service/db_interfaces.js';

type GameResult = z.infer<typeof Schema.GameResultSchema>;
type User = z.infer<typeof Schema.UserSchema>;
type FullUser = z.infer<typeof Schema.FullUserSchema>;

class Database {
	private db: DatabaseSync;

	constructor(dbPath: string = 'inception.db') {
		this.db = new DatabaseSync(dbPath);
		this._initializeTables();

		this.db.exec('PRAGMA foreign_keys = ON');
	}

	private _initializeTables(): void {
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

	fetchAllUsers(): FullUser[] {
		const result = z.array(Schema.UserSchema).safeParse(this.db.prepare(`
			SELECT id, createdAt, username, email FROM users
		`).all());

		if (!result.success) {
			console.error('Failed to fetch users:', result.error);
			return [];
		}

		return result.data.map((user: User) => ({
			...user,
			gameResults: this.fetchUserGameResults(user.id)
		}));
	}

	fetchUserGameResults(userId: number): GameResult[] {
		const stmt = this.db.prepare(`SELECT * FROM player_game_results WHERE userId = ?`);
		const result = z.array(Schema.GameResultSchema).safeParse(stmt.all(userId));
		if (!result.success) {
			console.error('Failed to fetch user game results:', result.error);
			return [];
		}
		return result.data;
	}

	fetchUserById(id: number): FullUser | undefined {
		const stmt = this.db.prepare(`
			SELECT id, createdAt, username, email FROM users WHERE id = ?
		`);
		const user = Schema.UserSchema.safeParse(stmt.get(id));
		if (!user.success) return undefined;

		return Schema.FullUserSchema.safeParse({
			...user.data,
			gameResults: this.fetchUserGameResults(id),
		}).data;
	}

	createNewUser(username: string, email: string, passwordHash: string | null): FullUser | undefined {
		console.log('Creating user in database:', username, email);
		const stmt = this.db.prepare(`
			INSERT INTO users (username, email, passwordHash) VALUES (?, ?, ?)
		`);
		const info = stmt.run(username, email, passwordHash);
		return this.fetchUserById(Number(info.lastInsertRowid));
	}

	fetchUserFromCredentials(username: string, passwordHash: string): User | undefined {
		const stmt = this.db.prepare(`
			SELECT * FROM users WHERE username = ? AND passwordHash = ?
		`);
		return Schema.UserSchema.safeParse(stmt.get(username, passwordHash)).data;
	}

	close(): void {
		this.db.close();
	}
}

export default Database;
