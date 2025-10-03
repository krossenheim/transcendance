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

	fetchTokenHash(userId: number): string | null {
		try {
			const row = this.db.prepare(`SELECT token FROM user_tokens WHERE userId = ?`).get(userId);
			return row && typeof row.token === 'string' ? row.token : null;
		} catch (error) {
			console.error('Failed to fetch token hash:', error);
			return null;
		}
	}
}

export default TokenService;