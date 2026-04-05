import { Result } from '@app/shared/api/service/common/result';
import { Database, DatabaseError } from './database.js';
import { z } from 'zod';
import { RunResult } from 'better-sqlite3';

export class TokenService {
	private db: Database;

	constructor(db: Database) {
		this.db = db;
	}

	private _dbStoreOrUpdateToken(userId: number, hashedToken: string): Result<RunResult, DatabaseError> {
		return this.db.run(
			`INSERT INTO user_tokens (userId, token, createdAt)
			VALUES (?, ?, strftime('%s', 'now'))
			ON CONFLICT(userId) DO UPDATE SET token=excluded.token, createdAt=excluded.createdAt`,
			[userId, hashedToken]
		);
	}

	private _dbFetchUserIdFromToken(token: string): Result<number, DatabaseError> {
		return this.db.get(
			`SELECT userId FROM user_tokens WHERE token = ?`,
			z.object({ userId: z.number() }),
			[token]
		).map(row => row.userId);
	}

	private _dbRemoveTokenByUserId(userId: number): Result<RunResult, DatabaseError> {
		return this.db.run(
			`DELETE FROM user_tokens WHERE userId = ?`,
			[userId]
		);
	}

	public storeOrReplaceToken(userId: number, hashedToken: string): Result<RunResult, DatabaseError> {
		return this._dbStoreOrUpdateToken(userId, hashedToken)
	}

	public fetchUserIdFromToken(token: string): Result<number, DatabaseError> {
		return this._dbFetchUserIdFromToken(token);
	}

	public removeTokenByUserId(userId: number): Result<RunResult, DatabaseError> {
		return this._dbRemoveTokenByUserId(userId);
	}
}

export default TokenService;

