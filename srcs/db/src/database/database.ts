import DatabaseConstructor, { type Database as BetterSqlite3Database, type RunResult } from 'better-sqlite3';
import { zodParse } from '@app/shared/api/service/common/zodUtils';
import { Result } from '@app/shared/api/service/common/result';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';

export class Database {
	private db: BetterSqlite3Database;

	constructor(dbPath: string = 'inception.db') {
		if (fs.existsSync(dbPath)) {
			fs.unlinkSync(dbPath);
		}

		this.db = new DatabaseConstructor(dbPath);
		this._initializeDatabase();
	}

	private _initializeDatabase(): void {
		const filePath = path.join(__dirname, '..', '..', 'structure.sql');
		const sqlSetup = fs.readFileSync(filePath, 'utf-8');
		const statements = sqlSetup.split(/;\s*$/m).filter(Boolean);
		for (const stmt of statements) {
			try {
				this.db.exec(stmt);
			} catch (err) {
				console.error('SQL failed:', stmt);
				throw err;
			}
		}
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

	run(sql: string, params: any[] = []): Result<RunResult, string> {
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
