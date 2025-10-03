import type { FullUserType, UserType, FriendType, UserAuthDataType } from '../utils/api/service/db/user.js';
import { User, FullUser, Friend, UserAuthData } from '../utils/api/service/db/user.js';
import type { GameResultType } from '../utils/api/service/db/gameResult.js';
import { GameResult } from '../utils/api/service/db/gameResult.js';
import { Result } from '../utils/api/service/common/result.js';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';

function createGuestUsername(): string {
	const randomStr = Math.random().toString(36).substring(2, 10);
	return `guest_${randomStr}`;
}

export class UserService {
	private db: DatabaseSync;

	constructor(db: DatabaseSync) {
		this.db = db;
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

	fetchUserById(id: number): Result<FullUserType, string> {
		const stmt = this.db.prepare(`
			SELECT id, createdAt, username, alias, email, isGuest FROM users WHERE id = ?
		`);
		console.log(stmt);
		const user = User.safeParse(stmt.get(id));
		console.log(user);
		if (!user.success) return Result.Err('User not found');

		const parsed = FullUser.safeParse({
			...user.data,
			friends: this.fetchUserFriendlist(user.data),
		});

		if (!parsed.success) return Result.Err('Failed to parse user data');
		return Result.Ok(parsed.data);
	}

	createNewUser(username: string, email: string, passwordHash: string | null): Result<FullUserType, string> {
		console.log('Creating user in database:', username, email);
		const stmt = this.db.prepare(`
			INSERT INTO users (username, email, passwordHash, isGuest) VALUES (?, ?, ?, ?)
		`);
		const info = stmt.run(username, email, passwordHash, 0);
		return this.fetchUserById(Number(info.lastInsertRowid));
	}

	createNewGuestUser(): Result<FullUserType, string> {
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

		return Result.Err('Failed to create unique guest username');
	}

	fetchUserFromUsername(username: string): Result<UserAuthDataType, string> {
		const stmt = this.db.prepare(`
			SELECT id, passwordHash, isGuest FROM users WHERE username = ?
		`);
		const parsed = UserAuthData.safeParse(stmt.get(username));
		if (!parsed.success) return Result.Err('Username not found');
		return Result.Ok(parsed.data);
	}
}
