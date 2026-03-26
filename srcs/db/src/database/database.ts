import type { Database as BetterSqlite3Database, RunResult, Statement } from 'better-sqlite3';
import { Result, UnwrapError } from '@app/shared/api/service/common/result';
import { zodParse } from '@app/shared/api/service/common/zodUtils';
import DatabaseConstructor from 'better-sqlite3';
import { SqliteError } from 'better-sqlite3';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';

const ZOD_VALIDATION: boolean = process.env.DB_ZOD_VALIDATION === 'true';

export enum DatabaseErrorType {
	CONFLICT = 'CONFLICT',
	NOT_FOUND = 'NOT FOUND',
	BAD_REQUEST = 'BAD REQUEST',
	INTERNAL = 'INTERNAL',
};

export class DatabaseError {
	type: DatabaseErrorType;
	message: string;

	constructor(type: DatabaseErrorType, message: string) {
		this.type = type;
		this.message = message;
	}

	static internal(message: string): DatabaseError {
		return new DatabaseError(DatabaseErrorType.INTERNAL, message);
	}
}

export class Database {
	private db: BetterSqlite3Database;

	constructor(dbPath: string = 'inception.db') {
		this.db = new DatabaseConstructor(dbPath);
		this._initializeDatabase();
	}

	private _validationErrorToDatabaseError(err: string): DatabaseError {
		return new DatabaseError(DatabaseErrorType.BAD_REQUEST, err);
	}

	public mapErrorToDatabaseError(err: any): DatabaseError {
		if (err instanceof SqliteError) {
			switch (err.code) {
				case 'SQLITE_CONSTRAINT_UNIQUE':
					return new DatabaseError(DatabaseErrorType.CONFLICT, 'Unique constraint failed');
				case 'SQLITE_CONSTRAINT_FOREIGNKEY':
					return new DatabaseError(DatabaseErrorType.BAD_REQUEST, 'Foreign key constraint failed');
				case 'SQLITE_CONSTRAINT_CHECK':
					return new DatabaseError(DatabaseErrorType.BAD_REQUEST, 'Check constraint failed');
				case 'SQLITE_NOTFOUND':
					return new DatabaseError(DatabaseErrorType.NOT_FOUND, 'Record not found');
				default:
					return new DatabaseError(DatabaseErrorType.INTERNAL, 'Database error');
			}
		}

		return new DatabaseError(DatabaseErrorType.INTERNAL, 'Unknown error');
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

	public all<T extends z.ZodType<any>>(sql: string | Statement, target: T, params: any[] = []): Result<z.infer<T>[], DatabaseError> {
		try {
			const stmt = typeof sql === 'string' ? this.db.prepare(sql) : sql;
			const rows = stmt.all(...params);

			if (ZOD_VALIDATION) return zodParse(z.array(target), rows).mapErr(this._validationErrorToDatabaseError);
			else return Result.Ok(rows as z.infer<T>[]);
		} catch (e) {
			console.error(e);
			return Result.Err(this.mapErrorToDatabaseError(e));
		}
	}

	public get<T extends z.ZodType<any>>(sql: string | Statement, target: T, params: any[] = []): Result<z.infer<T>, DatabaseError> {
		try {
			const stmt = typeof sql === 'string' ? this.db.prepare(sql) : sql;
			const row = stmt.get(...params);
			if (!row) return Result.Err({ type: DatabaseErrorType.NOT_FOUND, message: 'Record not found' });

			if (ZOD_VALIDATION) return zodParse(target, row).mapErr(this._validationErrorToDatabaseError);
			else return Result.Ok(row as z.infer<T>);
		} catch (e) {
			console.error(e);
			return Result.Err(this.mapErrorToDatabaseError(e));
		}
	}

	public run(sql: string | Statement, params: any[] = []): Result<RunResult, DatabaseError> {
		try {
			const stmt = typeof sql === 'string' ? this.db.prepare(sql) : sql;
			return Result.Ok(stmt.run(...params));
		} catch (e) {
			console.error(e);
			return Result.Err(this.mapErrorToDatabaseError(e));
		}
	}

	public update(tableName: string, data: Record<string, any>, whereClause: string, whereParams: any[] = []): Result<RunResult, DatabaseError> {
		const filteredData = Object.fromEntries(Object.entries(data).filter(([_, value]) => value !== undefined));
		const setClause = Object.keys(filteredData).map(key => `${key} = ?`).join(', ');
		const params = [...Object.values(filteredData), ...whereParams];
		const sql = `UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`;
		return this.run(sql, params);
	}

	public prepare(sql: string): Statement {
		return this.db.prepare(sql);
	}

	public transaction<T>(fn: () => Result<T, DatabaseError>): Result<T, DatabaseError> {
		const executeTransaction = this.db.transaction(() => {
			return fn().unwrap();
		});

		try {
			return Result.Ok(executeTransaction());
		} catch (e) {
			console.error(`Transaction failed: ${e}`);
			if (e instanceof UnwrapError && e.error instanceof DatabaseError)
				return Result.Err(e.error);
			return Result.Err(this.mapErrorToDatabaseError(e));
		}
	}

	public safeBlock<T>(fn: () => Result<T, DatabaseError>): Result<T, DatabaseError> {
		return Result.safeTry(fn, (e) => {
			console.error(`Safe block failed: ${e}`);
			return this.mapErrorToDatabaseError(e);
		});
	}

	public safeBlockAsync<T>(fn: () => Promise<Result<T, DatabaseError>>): Promise<Result<T, DatabaseError>> {
		return Result.safeTryAsync(fn, (e) => {
			console.error(`Safe block async failed: ${e}`);
			return this.mapErrorToDatabaseError(e);
		});
	}

	public close(): void {
		this.db.close();
	}
}

export default Database;
