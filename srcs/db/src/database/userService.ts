import type { FullUserType, FriendType, UserAuthDataType, PublicUserDataType } from '@app/shared/api/service/db/user';
import { User, Friend, UserAuthData, UserAccountType } from '@app/shared/api/service/db/user';
import { UserFriendshipStatusEnum } from '@app/shared/api/service/db/friendship';
import { generatePublicUserData } from '@app/shared/api/service/db/user';
import type { GameResultsWidgetType, GameResultType } from '@app/shared/api/service/db/gameResult';
import { GameResult } from '@app/shared/api/service/db/gameResult';
import { Result } from '@app/shared/api/service/common/result';
import { Database } from './database.js';
import { Resvg } from '@resvg/resvg-js';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';

function createGuestUsername(): string {
	const randomStr = Math.random().toString(36).substring(2, 10);
	return `guest_${randomStr}`;
}

function svgPfpToPng(svg: string): Buffer<ArrayBufferLike> {
	const resvg = new Resvg(svg, {
		fitTo: {
			mode: "width" as const,
			value: 500,
		}
	});
	const pngData = resvg.render();
	return pngData.asPng();
}

async function createDefaultAvatar(userId: number): Promise<Result<string, string>> {
	const avatar = await axios.get(`https://api.dicebear.com/9.x/shapes/svg?seed=${Math.random().toString(36).substring(2, 15)}`);
	const pngBuffer = svgPfpToPng(avatar.data);

	try {
		const dirPath = '/etc/database_data/pfps';
		const fileName = `${userId}default.png`;
		await fs.mkdir(dirPath, { recursive: true });
		await fs.writeFile(`${dirPath}/${fileName}`, pngBuffer);
		return Result.Ok(fileName);
	} catch (error) {
		console.error('Failed to store avatar PNG:', error);
		return Result.Err('Failed to store avatar PNG');
	}
}

export class UserService {
	private db: Database;

	constructor(db: Database) {
		this.db = db;
	}

	fetchUserPendingFriendRequests(userId: number): Result<FriendType[], string> {
		const result = this.db.all(
			`SELECT u.id as friendId, u.username, u.alias, u.avatarUrl, u.bio, uf.userId as id, uf.status, uf.createdAt
			FROM user_friendships uf
			JOIN users u ON u.id = uf.friendId
			WHERE uf.friendId = ? AND uf.status = ?`,
			Friend,
			[userId, UserFriendshipStatusEnum.Pending]
		);
		if (result.isErr()) {
			console.log('Error fetching pending friend requests for userId', userId, ':', result.unwrapErr());
			return Result.Err(result.unwrapErr());
		}
		return result;
	}

	fetchUserFriendlist(userId: number): Result<FriendType[], string> {
		const result = this.db.all(
			`SELECT u.id as friendId, u.username, u.alias, u.avatarUrl, u.bio, uf.userId as id, uf.status, uf.createdAt
			FROM user_friendships uf
			JOIN users u ON u.id = uf.friendId
			WHERE uf.userId = ?`,
			Friend,
			[userId]
		);
		if (result.isErr()) {
			console.log('Error fetching friendlist for userId', userId, ':', result.unwrapErr());
			return Result.Err(result.unwrapErr());
		}

		const invitesResult = this.fetchUserPendingFriendRequests(userId);
		if (invitesResult.isErr()) {
			console.log('Error fetching pending friend requests for userId', userId, ':', invitesResult.unwrapErr());
			return Result.Err(invitesResult.unwrapErr());
		}

		const friends = result.unwrap();
		const invites = invitesResult.unwrap();

		const combinedList = [...friends, ...invites];
		return Result.Ok(combinedList);
	}

	fetchAllUsers(): Result<FullUserType[], string> {
		return this.db.all(
			`SELECT u.id, u.createdAt, u.username, u.alias, u.email, u.bio, u.accountType, u.avatarUrl,
			       COALESCE(tfa.isEnabled, 0) as has2FA
			 FROM users u
			 LEFT JOIN user_2fa_secrets tfa ON u.id = tfa.userId`,
			User
		).map(users =>
			users.map(user => ({
				...user,
				friends: this.fetchUserFriendlist(user.id).unwrapOr([]),
				gameResults: this.createGameResultWidget(user.id).unwrapOr(null),
			}))
		);
	}

	fetchUserGameResults(userId: number): Result<GameResultType[], string> {
		const result = this.db.all(
			`SELECT * FROM player_game_results WHERE userId = ?`,
			GameResult,
			[userId]
		);
		console.log('Fetched game results for userId', userId, ':', result);
		return result;
	}

	createGameResultWidget(userId: number): Result<GameResultsWidgetType | null, string> {
		const resultsRes = this.fetchUserGameResults(userId);
		if (resultsRes.isErr()) {
			return Result.Err(resultsRes.unwrapErr());
		}

		const results = resultsRes.unwrap();
		const totalGames = results.length;
		const totalWins = results.filter(result => result.rank === 1).length;

		if (totalGames === 0)
			return Result.Err("No game results found for user");

		const ret = Result.Ok({
			last_games: results.slice(-10),
			total_games_played: totalGames,
			wins: totalWins,
			win_rate: totalGames > 0 ? (totalWins / totalGames) * 100 : 0,
		});
		console.log('Game results widget for userId', userId, ':', ret);
		return ret;
	}

	fetchPublicUsersByIds(ids: number[]): Result<PublicUserDataType[], string> {
		if (ids.length === 0)
			return Result.Ok([]);

		const placeholders = ids.map(() => '?').join(', ');
		return this.db.all(
			`SELECT u.id, u.createdAt, u.username, u.alias, u.email, u.bio, u.accountType, u.avatarUrl, COALESCE(tfa.isEnabled, 0) as has2FA
			 FROM users u
			 LEFT JOIN user_2fa_secrets tfa ON u.id = tfa.userId
			 WHERE u.id IN (${placeholders})`,
			User.omit({ gameResults: true }),
			ids
		).map(users =>
			users.map(user => generatePublicUserData({
				...user,
				gameResults: this.createGameResultWidget(user.id).unwrapOr(null),
			}))
		);
	}

	fetchUserById(id: number): Result<FullUserType, string> {
		return this.db.get(
			`SELECT u.id, u.createdAt, u.username, u.alias, u.email, u.bio, u.accountType, u.avatarUrl,
			       COALESCE(tfa.isEnabled, 0) as has2FA
			 FROM users u
			 LEFT JOIN user_2fa_secrets tfa ON u.id = tfa.userId
			 WHERE u.id = ?`,
			User.omit({ gameResults: true, }),
			[id]
		).map((user) => ({
			...user,
			friends: this.fetchUserFriendlist(user.id).unwrapOr([]),
			gameResults: this.createGameResultWidget(user.id).unwrapOr(null),
		}));
	}

	async createNewUser(username: string, email: string, passwordHash: string | null, accountType: UserAccountType): Promise<Result<FullUserType, string>> {
		console.log('Creating user in database:', username, email, accountType);
		const newUser = this.db.run(
			`INSERT INTO users (username, email, passwordHash, accountType) VALUES (?, ?, ?, ?)`,
			[username, email, passwordHash, accountType.valueOf()]
		);
		if (newUser.isErr()) {
			console.error('Error inserting user:', newUser.unwrapErr());
			return Result.Err('Failed to create user');
		}

		const userId = Number(newUser.unwrap().lastInsertRowid);
		const avatarResult = await createDefaultAvatar(userId);

		if (avatarResult.isOk()) {
			this.db.run(`
				UPDATE users SET avatarUrl = ? WHERE id = ?
			`, [avatarResult.unwrap(), userId]);
		} else
			console.error('Failed to create default avatar:', avatarResult.unwrapErr());

		return this.fetchUserById(userId);
	}

	async createNewGuestUser(): Promise<Result<FullUserType, string>> {
		let max_tries = 5;

		while (max_tries-- > 0) {
			const username = createGuestUsername();
			const creationResult = await this.createNewUser(username, `${username}@example.com`, null, UserAccountType.Guest);
			if (creationResult.isOk()) return creationResult;
		}

		return Result.Err('Failed to create unique guest username');
	}

	fetchUserFromUsername(username: string): Result<FullUserType, string> {
		return this.db.get(
			`SELECT u.id, u.createdAt, u.username, u.alias, u.email, u.bio, u.accountType, u.avatarUrl,
			       COALESCE(tfa.isEnabled, 0) as has2FA
			 FROM users u
			 LEFT JOIN user_2fa_secrets tfa ON u.id = tfa.userId
			 WHERE u.username = ?`,
			User.omit({ gameResults: true }),
			[username]
		).map((user) => ({
			...user,
			friends: this.fetchUserFriendlist(user.id).unwrapOr([]),
			gameResults: this.createGameResultWidget(user.id).unwrapOr(null),
		}));
	}

	fetchAuthUserDataFromUsername(username: string): Result<UserAuthDataType, string> {
		return this.db.get(
			`SELECT id, passwordHash, accountType FROM users WHERE username = ?`,
			UserAuthData,
			[username]
		);
	}

	async fetchUserAvatar(file: string): Promise<Result<string, string>> {
		try {
			// Sanitize filename to prevent path traversal attacks
			// Only allow alphanumeric characters, underscores, hyphens, and dots
			const sanitizedFile = path.basename(file);
			if (!sanitizedFile || sanitizedFile !== file || /[^a-zA-Z0-9_\-.]/.test(sanitizedFile)) {
				console.error('Invalid avatar filename attempted:', file);
				return Result.Err('Invalid filename');
			}
			
			// Ensure the resolved path is within the allowed directory
			const basePath = '/etc/database_data/pfps';
			const resolvedPath = path.resolve(basePath, sanitizedFile);
			if (!resolvedPath.startsWith(basePath + path.sep)) {
				console.error('Path traversal attempt detected:', file);
				return Result.Err('Invalid filename');
			}
			
			const png = await fs.readFile(resolvedPath);
			return Result.Ok(png.toString('base64'));
		} catch (error) {
			console.error('Failed to read avatar:', error);
			return Result.Err('Avatar not found');
		}
	}

	updateMutualUserConnection(userId1: number, userId2: number, status: UserFriendshipStatusEnum): Result<null, string> {
		if (status == UserFriendshipStatusEnum.None) {
			return this.db.run(
				`DELETE FROM user_friendships WHERE (userId = ? AND friendId = ?)`,
				[userId1, userId2]
			).map(() => null);
		} else {
			return this.db.run(
				`INSERT INTO user_friendships (userId, friendId, status) VALUES (?, ?, ?) ON CONFLICT(userId, friendId) DO UPDATE SET status = excluded.status`,
				[userId1, userId2, status]
			).map(() => null);
		}
	}

	async updateUserData(userId: number, bio?: string, alias?: string, email?: string, pfp?: { filename: string; data: string; }): Promise<Result<FullUserType, string>> {
		const updates = [];
		const params = [];

		if (bio !== undefined) {
			updates.push('bio = ?');
			params.push(bio);
		}
		if (alias !== undefined) {
			updates.push('alias = ?');
			params.push(alias);
		}
		if (email !== undefined) {
			updates.push('email = ?');
			params.push(email);
		}
		if (pfp !== undefined) {
			const pngBuffer = Buffer.from(pfp.data, 'base64');
			try {
				const dirPath = '/etc/database_data/pfps';
				await fs.mkdir(dirPath, { recursive: true });
				await fs.writeFile(`${dirPath}/${pfp.filename}`, pngBuffer);
				updates.push('avatarUrl = ?');
				params.push(pfp.filename);
			} catch (error) {
				console.error('Failed to store new profile picture:', error);
				return Result.Err('Failed to store new profile picture');
			}
		}

		if (updates.length === 0) {
			return Result.Err('No data provided for update');
		}

		params.push(userId);
		const updateQuery = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;

		const updateResult = this.db.run(updateQuery, params);
		if (updateResult.isErr()) {
			console.error('Failed to update user data:', updateResult.unwrapErr());
			return Result.Err('Failed to update user data');
		}

		return this.fetchUserById(userId);
	}

	async anonymizeUser(userId: number): Promise<Result<FullUserType, string>> {
		const userRes = this.fetchUserById(userId);
		if (userRes.isErr()) return Result.Err(userRes.unwrapErr());
		const user = userRes.unwrap();

		// attempt to remove avatar file if present
		if (user.avatarUrl) {
			try {
				await fs.unlink(`/etc/database_data/pfps/${user.avatarUrl}`);
			} catch (e) {
				// ignore file removal errors
			}
		}

		// create anonymized unique username and email
		const anonUsername = `deleted_user_${userId}_${Date.now()}`;
		const anonEmail = `deleted+${userId}_${Date.now()}@example.invalid`;

		const updateResult = this.db.run(
			`UPDATE users SET username = ?, alias = NULL, email = ?, bio = NULL, passwordHash = NULL, avatarUrl = NULL, accountType = ? WHERE id = ?`,
			[anonUsername, anonEmail, UserAccountType.Guest.valueOf(), userId]
		);

		if (updateResult.isErr()) {
			console.error('Failed to anonymize user:', updateResult.unwrapErr());
			return Result.Err('Failed to anonymize user');
		}

		return this.fetchUserById(userId);
	}

	async deleteUser(userId: number): Promise<Result<null, string>> {
		const userRes = this.fetchUserById(userId);
		if (userRes.isErr()) return Result.Err(userRes.unwrapErr());
		const user = userRes.unwrap();

		// remove avatar file if present
		if (user.avatarUrl) {
			try {
				await fs.unlink(`/etc/database_data/pfps/${user.avatarUrl}`);
			} catch (e) {
				// ignore file removal errors
			}
		}

		const del = this.db.run(`DELETE FROM users WHERE id = ?`, [userId]);
		if (del.isErr()) {
			console.error('Failed to delete user:', del.unwrapErr());
			return Result.Err('Failed to delete user');
		}

		return Result.Ok(null);
	}

	async storeGameResults(results: GameResultType[]): Promise<Result<null, string>> {
		let baseStmt = `INSERT INTO player_game_results (gameId, userId, score, rank) VALUES `;
		for (let i = 0; i < results.length; i++) {
			baseStmt += `(?, ?, ?, ?)`;
			if (i < results.length - 1) {
				baseStmt += `, `;
			}
		}

		const params: any[] = [];
		for (const result of results) {
			params.push(result.gameId, result.userId, result.score, result.rank);
		}

		const insertResult = this.db.run(baseStmt, params);
		if (insertResult.isErr()) {
			console.error('Failed to store game results:', insertResult.unwrapErr());
			return Result.Err('Failed to store game results');
		}

		return Result.Ok(null);
	}
}
