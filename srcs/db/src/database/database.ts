import DatabaseConstructor, { type Database as BetterSqlite3Database, type RunResult, type Statement } from 'better-sqlite3';
import { zodParse } from '@app/shared/api/service/common/zodUtils';
import { Result } from '@app/shared/api/service/common/result';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';

export class Database {
	private db: BetterSqlite3Database;

	constructor(dbPath: string = 'inception.db') {
		this.db = new DatabaseConstructor(dbPath);
		this._initializeDatabase();
	}

	private _initializeDatabase(): void {
		const filePath = path.join(__dirname, '..', '..', 'sql', 'database.sql');
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

		this.db.pragma('journal_mode = WAL');
	}

	all<T extends z.ZodTypeAny>(sql: string | Statement, target: T, params: any[] = []): Result<z.infer<T>[], string> {
		try {
			const stmt = typeof sql === 'string' ? this.db.prepare(sql) : sql;
			const rows = stmt.all(...params);
			return zodParse(z.array(target), rows);
		} catch (e) {
			console.error(e);
			return Result.Err(`DB exec failed`);
		}
	}

	get<T extends z.ZodTypeAny>(sql: string | Statement, target: T, params: any[] = []): Result<z.infer<T>, string> {
		try {
			const stmt = typeof sql === 'string' ? this.db.prepare(sql) : sql;
			const row = stmt.get(...params);
			if (!row) return Result.Err('Not found');
			return zodParse(target, row);
		} catch (e) {
			console.error(e);
			return Result.Err(`DB get failed`);
		}
	}

	run(sql: string | Statement, params: any[] = []): Result<RunResult, string> {
		try {
			const stmt = typeof sql === 'string' ? this.db.prepare(sql) : sql;
			return Result.Ok(stmt.run(...params));
		} catch (e) {
			console.error(e);
			return Result.Err(`DB run failed`);
		}
	}

	prepare(sql: string): Statement {
		return this.db.prepare(sql);
	}

	close(): void {
		this.db.close();
	}
}

export default Database;
