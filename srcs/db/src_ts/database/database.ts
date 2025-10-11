import { zodParse } from '../utils/api/service/common/zodUtils.js';
import { Result } from '../utils/api/service/common/result.js';
import type { StatementResultingChanges } from 'node:sqlite';
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

	all<T extends z.ZodTypeAny>(sql: string, target: T, params: any[] = []): Result<z.infer<T>[], string> {
		try {
			const stmt = this.db.prepare(sql);
			const rows = stmt.all(...params);
			return zodParse(z.array(target), rows);
		} catch (e) {
			console.error(e);
			return Result.Err(`DB exec failed`);
		}
	}

	get<T extends z.ZodTypeAny>(sql: string, target: T, params: any[] = []): Result<z.infer<T>, string> {
		try {
			const stmt = this.db.prepare(sql);
			const row = stmt.get(...params);
			if (!row) return Result.Err('Not found');
			return zodParse(target, row);
		} catch (e) {
			console.error(e);
			return Result.Err(`DB get failed`);
		}
	}

	run(sql: string, params: any[] = []): Result<StatementResultingChanges, string> {
		try {
			const stmt = this.db.prepare(sql);
			return Result.Ok(stmt.run(...params));
		} catch (e) {
			console.error(e);
			return Result.Err(`DB run failed`);
		}
	}

	close(): void {
		this.db.close();
	}
}

export default Database;
