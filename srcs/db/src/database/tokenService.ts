import { Result } from '@app/shared/api/service/common/result';
import { Database } from './database.js';
import { z } from 'zod';

export class TokenService {
	private db: Database;

	constructor(db: Database) {
		this.db = db;
	}

	storeToken(userId: number, hashedToken: string): Result<null, string> {
		return this.db.run(
			`INSERT INTO user_tokens (userId, token, createdAt)
			VALUES (?, ?, strftime('%s', 'now')) ON CONFLICT(userId) DO UPDATE SET token=excluded.token, createdAt=excluded.createdAt`,
			[userId, hashedToken]
		).map(() => null);
	}

	fetchUserIdFromToken(token: string): Result<number, string> {
		return this.db.get(
			`SELECT userId FROM user_tokens WHERE token = ?`,
			z.object({ userId: z.number() }),
			[token]
		).map(row => row.userId);
	}

	removeTokenByUserId(userId: number): Result<null, string> {
		return this.db.run(
			`DELETE FROM user_tokens WHERE userId = ?`,
			[userId]
		).map(() => null);
	}
}

export default TokenService;