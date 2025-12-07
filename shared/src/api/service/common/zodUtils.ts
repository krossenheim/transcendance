import { Result } from "@app/shared/api/service/common/result";
import { z } from "zod";

export function zodParse<T extends z.ZodTypeAny>(schema: T, data: unknown): Result<z.infer<T>, string> {
	const parsed = schema.safeParse(data);
	if (parsed.success) return Result.Ok(parsed.data);

	const messages = parsed.error.issues.map(issue => {
		const path = issue.path.length ? issue.path.join('.') : '<root>';
		return `- ${path}: ${issue.message}`;
	});

	return Result.Err([
		'Schema validation failed:',
		...messages,
		`(Total ${messages.length} issue${messages.length !== 1 ? 's' : ''})`,
	].join('\n'));
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