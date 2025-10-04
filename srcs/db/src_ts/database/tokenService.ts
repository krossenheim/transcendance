import { Result } from '../utils/api/service/common/result.js';
import { DatabaseSync } from 'node:sqlite';

export class TokenService {
	private db: DatabaseSync;

	constructor(db: DatabaseSync) {
		this.db = db;
	}

	storeToken(userId: number, hashedToken: string): boolean {
		try {
			this.db.prepare(`
				INSERT INTO user_tokens (userId, token, createdAt)
				VALUES (?, ?, strftime('%s', 'now'))
				ON CONFLICT(userId) DO UPDATE SET token = excluded.token, createdAt = excluded.createdAt
			`).run(userId, hashedToken);
			return true;
		} catch (error) {
			console.error('Failed to store token:', error);
			return false;
		}
	}

	fetchUserIdFromToken(token: string): Result<number, string> {
		try {
			const row = this.db.prepare(`SELECT userId FROM user_tokens WHERE token = ?`).get(token);
			if (!row)
				return Result.Err('Token not found');
			if (typeof row.userId !== 'number' || row.userId < 1)
				return Result.Err('Invalid user ID');
			return Result.Ok(row.userId);
		} catch (error) {
			console.error('Failed to fetch user from token:', error);
			return Result.Err('Internal error');
		}
	}
}

export default TokenService;