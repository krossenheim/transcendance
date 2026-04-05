import { type UserNotificationsType } from '@app/shared/api/service/db/notification.js';
import type { FullUserType, BaseUserType, FriendType, UserAuthDataType, PublicUserDataType } from '@app/shared/api/service/db/user';
import { Friend, UserAuthData, UserAccountType, BaseUser } from '@app/shared/api/service/db/user';
import type { GameResultsWidgetType, GameResultType, MatchHistoryEntryType, MatchHistoryRowType } from '@app/shared/api/service/db/gameResult';
import { ChatRoomUserAccessType, TypeRoomSchema } from '@app/shared/api/service/chat/db_models';
import { UserFriendshipStatusEnum } from '@app/shared/api/service/db/friendship';
import { GameResult, MatchHistoryRow } from '@app/shared/api/service/db/gameResult';
import { Result } from '@app/shared/api/service/common/result';
import { Database, DatabaseError } from './database';
import { Resvg } from '@resvg/resvg-js';
import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { RunResult } from 'better-sqlite3';

function createGuestUsername(): string {
	const randomStr = Math.random().toString(36).substring(2, 10);
	return `guest_${randomStr}`;
}

const PFP_DIR = '/etc/database_data/pfps';
function getPfpFileName(filename: string, userId: number): string {
	return `${userId}${sanitizePfpFilename(filename).unwrapOr('_')}`;
}

function sanitizePfpFilename(filename: string): Result<string, string> {
	const base = path.basename(filename);
	if (!base) return Result.Err('Invalid filename');

	let sanitized = base.replace(/[^a-zA-Z0-9_\-.]/g, '_').replace(/^\.+/, '');
	if (!sanitized) return Result.Err('Invalid filename');

	if (sanitized.length > 255) sanitized = sanitized.slice(0, 255);
	return Result.Ok(sanitized);
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

async function storePfp(filename: string, imageData: Buffer): Promise<Result<void, string>> {
	try {
		await fs.mkdir(PFP_DIR, { recursive: true });
		await fs.writeFile(`${PFP_DIR}/${filename}`, imageData);
		return Result.Ok(undefined);
	} catch (error) {
		console.error('Failed to store profile picture:', error);
		return Result.Err('Failed to store profile picture');
	}
}

async function createDefaultAvatar(userId: number): Promise<Result<string, string>> {
	const avatar = await axios.get(`https://api.dicebear.com/9.x/shapes/svg?seed=${Math.random().toString(36).substring(2, 15)}`);
	const pngBuffer = svgPfpToPng(avatar.data);
	const fileName = getPfpFileName('default.png', userId);
	return (await storePfp(fileName, pngBuffer)).map(() => fileName);
}

export class UserService {
	private db: Database;
	private chatService: any;

	constructor(db: Database, chatService: any) {
		this.db = db;
		this.chatService = chatService;
	}

	private _fetchUserBaseInfoById(id: number): Result<BaseUserType, DatabaseError> {
		return this.db.get(
			`SELECT u.id, u.createdAt, u.username, u.alias, u.email, u.bio, u.accountType, u.avatarUrl,
			       COALESCE(tfa.isEnabled, 0) as has2FA
			 FROM users u
			 LEFT JOIN user_2fa_secrets tfa ON u.id = tfa.userId
			 WHERE u.id = ?`,
			BaseUser,
			[id]
		);
	}

	private _fetchUserBaseInfoByUsername(username: string): Result<BaseUserType, DatabaseError> {
		return this.db.get(
			`SELECT u.id, u.createdAt, u.username, u.alias, u.email, u.bio, u.accountType, u.avatarUrl,
			       COALESCE(tfa.isEnabled, 0) as has2FA
			 FROM users u
			 LEFT JOIN user_2fa_secrets tfa ON u.id = tfa.userId
			 WHERE u.username = ?`,
			BaseUser,
			[username]
		);
	}

	private _storeGameResults(results: GameResultType[]): Result<null, DatabaseError> {
		return this.db.transaction(() => {
			const insert = this.db.prepare(`INSERT INTO player_game_results (gameId, userId, score, rank) VALUES (?, ?, ?, ?)`);
			for (const result of results)
				insert.run(result.gameId, result.userId, result.score, result.rank);
			return Result.Ok(null);
		});
	}

	private _fetchUserBaseInfoByIdList(ids: number[]): Result<BaseUserType[], DatabaseError> {
		if (ids.length === 0)
			return Result.Ok([]);

		const placeholders = ids.map(() => '?').join(', ');
		return this.db.all(
			`SELECT u.id, u.createdAt, u.username, u.alias, u.email, u.bio, u.accountType, u.avatarUrl,
			       COALESCE(tfa.isEnabled, 0) as has2FA
			 FROM users u
			 LEFT JOIN user_2fa_secrets tfa ON u.id = tfa.userId
			 WHERE u.id IN (${placeholders})`,
			BaseUser,
			ids
		).flatMap(users => {
			const userMap = new Map(users.map(u => [u.id, u]));
			if (users.length !== ids.length) {
				const missingIds = ids.filter(id => !userMap.has(id));
				return Result.Err(DatabaseError.internal(`Users not found for IDs: ${missingIds.join(', ')}`));
			}
			return Result.Ok(users);
		});
	}

	private _dbFetchUserFriendList(userId: number): Result<FriendType[], DatabaseError> {
		return this.db.all(
			`SELECT u.id as friendId, u.username, u.alias, u.avatarUrl, u.bio, uf.userId as id, uf.status, uf.createdAt
			FROM user_friendships uf
			JOIN users u ON u.id = uf.friendId
			WHERE uf.userId = ?`,
			Friend,
			[userId]
		);
	}

	private _dbFetchUserFriendshipRequests(userId: number): Result<FriendType[], DatabaseError> {
		return this.db.all(
			`SELECT u.id, u.username, u.alias, u.avatarUrl, u.bio, uf.friendId, uf.status, uf.createdAt
			FROM user_friendships uf
			JOIN users u ON u.id = uf.userId
			WHERE uf.friendId = ? AND uf.status = ?`,
			Friend,
			[userId, UserFriendshipStatusEnum.Pending.valueOf()]
		);
	}

	private _dbFetchUserGameResults(userId: number, limit: number): Result<GameResultType[], DatabaseError> {
		return this.db.all(
			`SELECT gameId, userId, score, rank, createdAt FROM player_game_results WHERE userId = ? ORDER BY gameId DESC LIMIT ?`,
			GameResult,
			[userId, limit]
		);
	}

	private _dbFetchUserMatchHistory(userId: number, limit: number): Result<MatchHistoryRowType[], DatabaseError> {
		return this.db.all(
			`SELECT pgr.gameId, pgr.score, pgr.rank, pgr.createdAt,
			        opp.userId AS opponentId, opp.score AS opponentScore, opp.rank AS opponentRank,
			        u.username AS opponentUsername, u.alias AS opponentAlias, u.avatarUrl AS opponentAvatarUrl
			 FROM player_game_results pgr
			 LEFT JOIN player_game_results opp ON pgr.gameId = opp.gameId AND opp.userId != pgr.userId
			 LEFT JOIN users u ON u.id = opp.userId
			 WHERE pgr.userId = ?
			 ORDER BY pgr.createdAt DESC
			 LIMIT ?`,
			MatchHistoryRow,
			[userId, limit * 4]
		);
	}

	private _utilCreateGameResultWidgetForUser(userId: number): Result<GameResultsWidgetType, DatabaseError> {
		return this._dbFetchUserGameResults(userId, 9999).map((results) => {
			const totalGames = results.length;
			const totalWins = results.filter(result => result.rank === 1).length;

			return {
				last_games: results.slice(0, 10),
				total_games_played: totalGames,
				wins: totalWins,
				win_rate: totalGames > 0 ? (totalWins / totalGames) * 100 : 0,
			};
		});
	}

	public fetchUserFriendlist(userId: number): Result<FriendType[], DatabaseError> {
		return this._dbFetchUserFriendList(userId);
	}

	public fetchUserGameResults(userId: number, limit: number = 10): Result<GameResultType[], DatabaseError> {
		return this._dbFetchUserGameResults(userId, limit);
	}

	public fetchUserMatchHistory(userId: number, limit: number = 20): Result<MatchHistoryEntryType[], DatabaseError> {
		return this._dbFetchUserMatchHistory(userId, limit).map((rows) => {
			const gameMap = new Map<number, MatchHistoryEntryType>();
			for (const row of rows) {
				let entry = gameMap.get(row.gameId);
				if (!entry) {
					entry = {
						gameId: row.gameId,
						score: row.score,
						rank: row.rank,
						createdAt: row.createdAt,
						opponents: [],
					};
					gameMap.set(row.gameId, entry);
				}
				if (row.opponentId !== null) {
					entry.opponents.push({
						userId: row.opponentId,
						username: row.opponentUsername ?? 'Unknown',
						alias: row.opponentAlias,
						avatarUrl: row.opponentAvatarUrl,
						score: row.opponentScore ?? 0,
						rank: row.opponentRank ?? 0,
					});
				}
			}
			return Array.from(gameMap.values()).slice(0, limit);
		});
	}

	public generatePublicUserData(user: BaseUserType): Result<PublicUserDataType, DatabaseError> {
		return this.db.safeBlock(() => {
			return Result.Ok({
				id: user.id,
				createdAt: user.createdAt,
				username: user.username,
				alias: user.alias,
				bio: user.bio,
				accountType: user.accountType,
				avatarUrl: user.avatarUrl,
				gameResults: this._utilCreateGameResultWidgetForUser(user.id).unwrap(),
				onlineStatus: null,
			});
		});
	}

	public generateFullUserData(user: BaseUserType): Result<FullUserType, DatabaseError> {
		return this.db.safeBlock(() => {
			return Result.Ok({
				id: user.id,
				createdAt: user.createdAt,
				username: user.username,
				alias: user.alias,
				email: user.email,
				bio: user.bio,
				accountType: user.accountType,
				avatarUrl: user.avatarUrl,
				has2FA: user.has2FA,
				friends: this.fetchUserFriendlist(user.id).unwrap(),
				gameResults: this._utilCreateGameResultWidgetForUser(user.id).unwrap(),
			})
		});
	}

	public fetchPublicUsersByIds(ids: number[]): Result<PublicUserDataType[], DatabaseError> {
		return this.db.safeBlock(() => {
			return this._fetchUserBaseInfoByIdList(ids).map(users => {
				return users.map((user) => this.generatePublicUserData(user).unwrap());
			});
		});
	}

	public fetchUserById(id: number): Result<FullUserType, DatabaseError> {
		return this._fetchUserBaseInfoById(id)
			.flatMap(user => this.generateFullUserData(user));
	}

	public fetchUserByUsername(username: string): Result<FullUserType, DatabaseError> {
		return this._fetchUserBaseInfoByUsername(username)
			.flatMap(user => this.generateFullUserData(user));
	}

	public fetchUserFriendshipRequests(userId: number): Result<FriendType[], DatabaseError> {
		return this._dbFetchUserFriendshipRequests(userId);
	}

	public fetchUserRoomInvites(userId: number): Result<TypeRoomSchema[], DatabaseError> {
		return this.chatService.getUserRooms(userId, ChatRoomUserAccessType.INVITED);
	}

	public fetchUserNotifications(id: number): Result<UserNotificationsType, DatabaseError> {
		return this.db.safeBlock(() => {
			return Result.Ok({
				pendingFriendRequests: this.fetchUserFriendshipRequests(id).unwrap(),
				pendingRoomInvites: this.fetchUserRoomInvites(id).unwrap(),
			});
		});
	}

	private _dbCreateNewUser(username: string, email: string, passwordHash: string | null, accountType: UserAccountType): Result<RunResult, DatabaseError> {
		return this.db.run(
			`INSERT INTO users (username, email, passwordHash, accountType) VALUES (?, ?, ?, ?)`,
			[username, email, passwordHash, accountType.valueOf()]
		);
	}

	private _dbUpdateUserData(userId: number, options?: { bio?: string | undefined, alias?: string | undefined, email?: string | undefined, avatarUrl?: string | undefined }): Result<RunResult, DatabaseError> {
		const updates = [];
		const params = [];

		if (options?.bio !== undefined) {
			updates.push('bio = ?');
			params.push(options.bio);
		}

		if (options?.alias !== undefined) {
			updates.push('alias = ?');
			params.push(options.alias);
		}

		if (options?.email !== undefined) {
			updates.push('email = ?');
			params.push(options.email);
		}

		if (options?.avatarUrl !== undefined) {
			updates.push('avatarUrl = ?');
			params.push(options.avatarUrl);
		}

		if (updates.length === 0)
			return Result.Err(DatabaseError.internal('No data provided for update'));

		return this.db.run(
			`UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
			[...params, userId]
		);
	}

	public async createNewUser(username: string, email: string, passwordHash: string | null, accountType: UserAccountType): Promise<Result<FullUserType, DatabaseError>> {
		return await this.db.safeBlockAsync(async () => {
			const newUserId = Number(this._dbCreateNewUser(username, email, passwordHash, accountType).unwrap().lastInsertRowid);
			const avatarFilename = (await createDefaultAvatar(newUserId)).unwrap();
			this._dbUpdateUserData(newUserId, { avatarUrl: avatarFilename }).unwrap();
			return this.fetchUserById(newUserId);
		});
	}

	public async createNewGuestUser(): Promise<Result<FullUserType, DatabaseError>> {
		let max_tries = 5;

		while (max_tries-- > 0) {
			const username = createGuestUsername();
			const creationResult = await this.createNewUser(username, `${username}@example.com`, null, UserAccountType.Guest);
			if (creationResult.isOk()) return creationResult;
		}

		return Result.Err(DatabaseError.internal('Failed to create unique guest username'));
	}

	private _dbFetchAuthUserData(username: string): Result<UserAuthDataType, DatabaseError> {
		return this.db.get(
			`SELECT id, passwordHash, accountType FROM users WHERE username = ?`,
			UserAuthData,
			[username]
		);
	}

	public fetchAuthUserDataFromUsername(username: string): Result<UserAuthDataType, DatabaseError> {
		return this._dbFetchAuthUserData(username);
	}

	public async fetchUserAvatar(file: string): Promise<Result<string, string>> {
		return await Result.safeTryAsync(async () => {
			const filename = sanitizePfpFilename(file).unwrap();
			const png = await fs.readFile(`${PFP_DIR}/${filename}`);
			return Result.Ok(png.toString('base64'));
		}, () => "Failed to fetch user avatar");
	}

	private _dbRemoveUserConnection(userId1: number, userId2: number): Result<RunResult, DatabaseError> {
		return this.db.run(
			`DELETE FROM user_friendships WHERE (userId = ? AND friendId = ?)`,
			[userId1, userId2]
		);
	}

	private _dbAddOrUpdateUserConnection(userId1: number, userId2: number, status: UserFriendshipStatusEnum): Result<RunResult, DatabaseError> {
		return this.db.run(
			`INSERT INTO user_friendships (userId, friendId, status) VALUES (?, ?, ?) ON CONFLICT(userId, friendId) DO UPDATE SET status = excluded.status`,
			[userId1, userId2, status.valueOf()]
		);
	}

	updateMutualUserConnection(userId1: number, userId2: number, status: UserFriendshipStatusEnum): Result<null, DatabaseError> {
		switch (status) {
			case UserFriendshipStatusEnum.None:
				return this._dbRemoveUserConnection(userId1, userId2).map(() => null);
			default:
				return this._dbAddOrUpdateUserConnection(userId1, userId2, status).map(() => null);
		}
	}

	async updateUserData(userId: number, bio?: string, alias?: string, email?: string, pfp?: { filename: string; data: string; }): Promise<Result<FullUserType, DatabaseError>> {
		let avatarUrl: string | undefined = undefined;

		if (pfp !== undefined) {
			avatarUrl = getPfpFileName(pfp.filename, userId);
			const storageResult = await storePfp(avatarUrl, Buffer.from(pfp.data, 'base64'));
			if (storageResult.isErr())
				return Result.Err(DatabaseError.internal(storageResult.unwrapErr()));
		}

		return this._dbUpdateUserData(userId, { bio, alias, email, avatarUrl })
			.flatMap(() => this.fetchUserById(userId));
	}

	async storeGameResults(results: GameResultType[]): Promise<Result<null, DatabaseError>> {
		return this._storeGameResults(results);
	}

	async anonymizeUser(userId: number): Promise<Result<FullUserType, DatabaseError>> {
		return Result.Err(DatabaseError.internal('Feature discontinued'));
	}

	async deleteUser(userId: number): Promise<Result<null, DatabaseError>> {
		return Result.Err(DatabaseError.internal('Feature discontinued'));
	}

}

