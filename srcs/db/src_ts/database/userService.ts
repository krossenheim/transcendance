import type { FullUserType, UserType, FriendType, UserAuthDataType } from '../utils/api/service/db/user.js';
import { User, FullUser, Friend, UserAuthData } from '../utils/api/service/db/user.js';
import type { GameResultType } from '../utils/api/service/db/gameResult.js';
import { GameResult } from '../utils/api/service/db/gameResult.js';
import { Result } from '../utils/api/service/common/result.js';
import { Database } from './database.js';
import fs from 'fs/promises';
import axios from 'axios';
import type { UserFriendshipStatusEnum } from 'utils/api/service/db/friendship.js';

function createGuestUsername(): string {
	const randomStr = Math.random().toString(36).substring(2, 10);
	return `guest_${randomStr}`;
}

async function createDefaultAvatar(userId: number): Promise<Result<null, string>> {
	const avatar = await axios.get(`https://api.dicebear.com/9.x/shapes/svg?seed=${Math.random().toString(36).substring(2, 15)}`);
	const svg = avatar.data;

	try {
		const dirPath = '/etc/database_data/pfps';
		await fs.mkdir(dirPath, { recursive: true });
		await fs.writeFile(`${dirPath}/${userId}.svg`, svg);
		return Result.Ok(null);
	} catch (error) {
		console.error('Failed to store avatar SVG:', error);
		return Result.Err('Failed to store avatar SVG');
	}
}

export class UserService {
	private db: Database;

	constructor(db: Database) {
		this.db = db;
	}

	fetchUserFriendlist(userId: number): Result<FriendType[], string> {
		return this.db.all(
			`SELECT u.id, u.username, u.alias, u.hasAvatar, uf.status, uf.createdAt
			FROM user_friendships uf
			JOIN users u
			ON u.id = CASE
				WHEN uf.userId = ? THEN uf.friendId
				ELSE uf.userId
			END
			WHERE uf.userId = ? OR uf.friendId = ?;`,
			Friend,
			[userId, userId, userId]
		);
	}

	fetchAllUsers(): Result<FullUserType[], string> {
		return this.db.all(
			`SELECT id, createdAt, username, alias, email, isGuest, hasAvatar FROM users`,
			User
		).map(users =>
			users.map(user => ({
				...user,
				friends: this.fetchUserFriendlist(user.id).unwrapOr([]),
			}))
		);
	}

	fetchUserGameResults(userId: number): Result<GameResultType[], string> {
		return this.db.all(
			`SELECT * FROM player_game_results WHERE userId = ?`,
			GameResult,
			[userId]
		);
	}

	fetchUserById(id: number): Result<FullUserType, string> {
		return this.db.get(
			`SELECT id, createdAt, username, alias, email, isGuest, hasAvatar FROM users WHERE id = ?`,
			User,
			[id]
		).map((user) => ({
			...user,
			friends: this.fetchUserFriendlist(user.id).unwrapOr([]),
		}));
	}

	async createNewUser(username: string, email: string, passwordHash: string | null, isGuest: boolean): Promise<Result<FullUserType, string>> {
		console.log('Creating user in database:', username, email);
		const newUser = this.db.run(
			`INSERT INTO users (username, email, passwordHash, isGuest) VALUES (?, ?, ?, ?)`,
			[username, email, passwordHash, isGuest ? 1 : 0]
		);
		if (newUser.isErr()) {
			console.error('Error inserting user:', newUser.unwrapErr());
			return Result.Err('Failed to create user');
		}

		const userId = Number(newUser.unwrap().lastInsertRowid);
		const avatarResult = await createDefaultAvatar(userId);

		if (avatarResult.isOk()) {
			this.db.run(`
				UPDATE users SET hasAvatar = ? WHERE id = ?
			`, [1, userId]);
		} else
			console.error('Failed to create default avatar:', avatarResult.unwrapErr());

		return this.fetchUserById(userId);
	}

	async createNewGuestUser(): Promise<Result<FullUserType, string>> {
		let max_tries = 5;

		while (max_tries-- > 0) {
			const username = createGuestUsername();
			const creationResult = await this.createNewUser(username, `${username}@example.com`, null, true);
			if (creationResult.isOk()) return creationResult;
		}

		return Result.Err('Failed to create unique guest username');
	}

	fetchUserFromUsername(username: string): Result<UserAuthDataType, string> {
		return this.db.get(
			`SELECT id, passwordHash, isGuest FROM users WHERE username = ?`,
			UserAuthData,
			[username]
		);
	}

	async fetchUserAvatar(userId: number): Promise<Result<string, string>> {
		try {
			const svg = await fs.readFile(`/etc/database_data/pfps/${userId}.svg`, 'utf-8');
			return Result.Ok(svg);
		} catch (error) {
			console.error('Failed to read avatar SVG:', error);
			return Result.Err('Avatar not found');
		}
	}

	getFriendsInOrder(userId: number, friendId: number): [number, number] {
		return userId < friendId ? [userId, friendId] : [friendId, userId];
	}

	updateUserConnection(userId: number, friendId: number, status: UserFriendshipStatusEnum): Result<null, string> {
		const [uid1, uid2] = this.getFriendsInOrder(userId, friendId);
		return this.db.run(
			`INSERT INTO user_friendships (userId, friendId, status) VALUES (?, ?, ?) ON CONFLICT(userId, friendId) DO UPDATE SET status = excluded.status`,
			[uid1, uid2, status]
		).map(() => null);
	}
}
