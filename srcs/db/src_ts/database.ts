import type { FullUserType, UserType, RawUserType } from './utils/api/service/db/user.js';
import type { GameResultType } from './utils/api/service/db/gameResult.js';
import { User, FullUser, RawUser } from './utils/api/service/db/user.js';
import { GameResult } from './utils/api/service/db/gameResult.js';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';

class Database {
	private db: DatabaseSync;

	constructor(dbPath: string = 'inception.db') {
		this.db = new DatabaseSync(dbPath);
		this._initializeTables();

		this.db.exec('PRAGMA foreign_keys = ON');
	}

	private _initializeTables(): void {
		this.db.exec(`
			DROP TABLE IF EXISTS player_game_results;
			DROP TABLE IF EXISTS users;
		`);

		this.db.exec(`
			CREATE TABLE IF NOT EXISTS users (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				createdAt INTEGER DEFAULT (strftime('%s', 'now')),
				username TEXT NOT NULL UNIQUE,
				email TEXT NOT NULL UNIQUE,
				passwordHash TEXT,
				isGuest INTEGER
			) STRICT;

			CREATE TABLE IF NOT EXISTS player_game_results (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				userId INTEGER NOT NULL,
				score INTEGER NOT NULL,
				rank INTEGER NOT NULL,
				FOREIGN KEY(userId) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
			) STRICT;
    	`);

		this.db.exec(`
			CREATE INDEX IF NOT EXISTS idx_user_username ON users(username);
			CREATE INDEX IF NOT EXISTS idx_user_email ON users(email);
			CREATE INDEX IF NOT EXISTS idx_game_results_userId ON player_game_results(userId);
		`);
	}

	fetchAllUsers(): FullUserType[] {
		const result = z.array(User).safeParse(this.db.prepare(`
			SELECT id, createdAt, username, email, isGuest FROM users
		`).all());

		if (!result.success) {
			console.error('Failed to fetch users:', result.error);
			return [];
		}

		return result.data.map((user: UserType) => ({
			...user,
			gameResults: this.fetchUserGameResults(user.id)
		}));
	}

	fetchUserGameResults(userId: number): GameResultType[] {
		const stmt = this.db.prepare(`SELECT * FROM player_game_results WHERE userId = ?`);
		const result = z.array(GameResult).safeParse(stmt.all(userId));
		if (!result.success) {
			console.error('Failed to fetch user game results:', result.error);
			return [];
		}
		return result.data;
	}

	fetchUserById(id: number): FullUserType | undefined {
		const stmt = this.db.prepare(`
			SELECT id, createdAt, username, email, isGuest FROM users WHERE id = ?
		`);
		const user = User.safeParse(stmt.get(id));
		if (!user.success) return undefined;

		return FullUser.safeParse({
			...user.data,
			gameResults: this.fetchUserGameResults(id),
		}).data;
	}

	createNewUser(username: string, email: string, passwordHash: string | null): FullUserType | undefined {
		console.log('Creating user in database:', username, email);
		const stmt = this.db.prepare(`
			INSERT INTO users (username, email, passwordHash, isGuest) VALUES (?, ?, ?, ?)
		`);
		const info = stmt.run(username, email, passwordHash, 0);
		return this.fetchUserById(Number(info.lastInsertRowid));
	}

	createNewGuestUser(): FullUserType | undefined {
		const current_time = Date.now();
		let max_tries = 5;

		while (max_tries-- > 0) {
			const username = `guest_${current_time}`;
			const stmt = this.db.prepare(`
				INSERT INTO users (username, email, passwordHash, isGuest) VALUES (?, ?, ?, ?)
			`);
			try {
				const info = stmt.run(username, `${username}@example.com`, null, 1);
				return this.fetchUserById(Number(info.lastInsertRowid));
			} catch (error) { }
		}

		return undefined;
	}

	fetchUserFromUsername(username: string): RawUserType | undefined {
		const stmt = this.db.prepare(`
			SELECT * FROM users WHERE username = ?
		`);
		return RawUser.safeParse(stmt.get(username)).data;
	}

	close(): void {
		this.db.close();
	}
}

export default Database;
