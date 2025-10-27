import { Result } from "./result.js";
import { z } from "zod";

export function zodParse<T extends z.ZodTypeAny>(schema: T, data: unknown): Result<z.infer<T>, string> {
	const parsed = schema.safeParse(data);
	if (parsed.success) return Result.Ok(parsed.data);

	const issues = parsed.error.issues
		.map(i => {
			const path = i.path.length ? i.path.join('.') : '<root>';
			return `${path}: ${i.message}${i.code ? ` (${i.code})` : ''}`;
		})
		.join('; ');

	const details = JSON.stringify(z.treeifyError(parsed.error), null, 2);
	return Result.Err(`Failed to parse schema: ${issues}\nDetails: ${details}`);
}

export type ZodSchema<T extends {
	body?: z.ZodTypeAny;
	params?: z.ZodTypeAny;
	response: Record<string | number, z.ZodTypeAny>;
}> = {
	Body: T["body"] extends z.ZodTypeAny ? z.infer<T["body"]> : unknown;
	Params: T["params"] extends z.ZodTypeAny ? z.infer<T["params"]> : unknown;
	Reply: { [K in keyof T["response"]]: z.infer<T["response"][K]> };
};

export default { zodParse };