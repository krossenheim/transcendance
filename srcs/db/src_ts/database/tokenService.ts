import { Result } from '../utils/api/service/common/result.js';
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
			VALUES (?, ?, strftime('%s', 'now'))`,
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
}

export default TokenService;