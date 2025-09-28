import type { FullUserType, UserType, FriendType, UserAuthDataType } from './utils/api/service/db/user.js';
import { User, FullUser, Friend, UserAuthData } from './utils/api/service/db/user.js';
import type { GameResultType } from './utils/api/service/db/gameResult.js';
import { GameResult } from './utils/api/service/db/gameResult.js';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';

function createGuestUsername(): string {
	const randomStr = Math.random().toString(36).substring(2, 10);
	return `guest_${randomStr}`;
}

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
			DROP TABLE IF EXISTS user_friendships;
			DROP TABLE IF EXISTS users;
		`);

		this.db.exec(`
			CREATE TABLE IF NOT EXISTS users (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				createdAt INTEGER DEFAULT (strftime('%s', 'now')),
				username TEXT NOT NULL UNIQUE,
				alias TEXT DEFAULT NULL,
				email TEXT NOT NULL UNIQUE,
				passwordHash TEXT DEFAULT NULL,
				isGuest INTEGER
			) STRICT;

			CREATE TABLE IF NOT EXISTS player_game_results (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				userId INTEGER NOT NULL,
				score INTEGER NOT NULL,
				rank INTEGER NOT NULL,
				FOREIGN KEY(userId) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
			) STRICT;

			CREATE TABLE IF NOT EXISTS user_friendships (
				userId INTEGER NOT NULL,
				friendId INTEGER NOT NULL,
				createdAt INTEGER DEFAULT (strftime('%s', 'now')),
				PRIMARY KEY (userId, friendId),
				FOREIGN KEY(userId) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
				FOREIGN KEY(friendId) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE
			)
    	`);

		this.db.exec(`
			CREATE INDEX IF NOT EXISTS idx_user_username ON users(username);
			CREATE INDEX IF NOT EXISTS idx_user_email ON users(email);
			CREATE INDEX IF NOT EXISTS idx_game_results_userId ON player_game_results(userId);
			CREATE INDEX IF NOT EXISTS idx_user_friendships ON user_friendships(userId);
		`);
	}

	fetchUserFriendlist(user: UserType): FriendType[] {
		const result = z.array(Friend).safeParse(this.db.prepare(`
			SELECT u.id, u.username, u.alias
			FROM users u
			JOIN user_friendships uf ON u.id = uf.friendId
			WHERE uf.userId = ?
		`).all(user.id));
		console.log(result);

		if (!result.success) {
			console.error(result.error);
			return [];
		}
		return result.data || [];
	}

	fetchAllUsers(): FullUserType[] {
		const result = z.array(User).safeParse(this.db.prepare(`
			SELECT id, createdAt, username, alias, email, isGuest FROM users
		`).all());

		if (!result.success) {
			console.error('Failed to fetch users:', result.error);
			return [];
		}

		return result.data.map((user: UserType) => ({
			...user,
			friends: this.fetchUserFriendlist(user),
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
			SELECT id, createdAt, username, alias, email, isGuest FROM users WHERE id = ?
		`);
		console.log(stmt);
		const user = User.safeParse(stmt.get(id));
		console.log(user);
		if (!user.success) return undefined;

		return FullUser.safeParse({
			...user.data,
			friends: this.fetchUserFriendlist(user.data),
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
		let max_tries = 5;

		while (max_tries-- > 0) {
			const username = createGuestUsername();
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

	fetchUserFromUsername(username: string): UserAuthDataType | undefined {
		const stmt = this.db.prepare(`
			SELECT id, passwordHash FROM users WHERE username = ?
		`);
		return UserAuthData.safeParse(stmt.get(username)).data;
	}

	close(): void {
		this.db.close();
	}
}

export default Database;
