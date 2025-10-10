import type { FullUserType, UserType, FriendType, UserAuthDataType } from '../utils/api/service/db/user.js';
import { User, FullUser, Friend, UserAuthData } from '../utils/api/service/db/user.js';
import type { GameResultType } from '../utils/api/service/db/gameResult.js';
import { GameResult } from '../utils/api/service/db/gameResult.js';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';

export class Database {
	private db: DatabaseSync;

	constructor(dbPath: string = 'inception.db') {
		this.db = new DatabaseSync(dbPath);
		this._initializeDatabase();
	}

	private _initializeDatabase(): void {
		const __filename = fileURLToPath(import.meta.url);
    	const __dirname = path.dirname(__filename);
    	const filePath = path.join(__dirname, '..', 'structure.sql');
		const sqlSetup = fs.readFileSync(filePath, 'utf-8');
		
		this.db.exec(sqlSetup);
	}

	close(): void {
		this.db.close();
	}

	getDB(): DatabaseSync {
		return this.db;
	}
}

export default Database;
