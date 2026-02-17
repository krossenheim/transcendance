import { Result } from "@app/shared/api/service/common/result";
import fs from 'fs';

function _loadSqlQueries(filePath: string): Record<string, string> {
	const content = fs.readFileSync(filePath, 'utf-8');
	const queries: Record<string, string> = {};

	const chunks = content.split(/^--\s*name:\s*/m).filter(Boolean);
	for (const chunk of chunks) {
		const [name, ...sql] = chunk.split('\n');
		if (name && sql.length)
			queries[name.trim()] = sql.join('\n').trim();
	}

	return queries;
}

export class SqlQueryLoader {
	private queries: Record<string, string>;

	constructor(filePath: string) {
		this.queries = _loadSqlQueries(filePath);
	}

	getQuery(name: string): Result<string, string> {
		const query = this.queries[name];
		if (!query) {
			return Result.Err(`Query "${name}" not found`);
		}
		return Result.Ok(query);
	}
}
