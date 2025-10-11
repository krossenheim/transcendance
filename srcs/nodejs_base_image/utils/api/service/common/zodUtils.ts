import { Result } from "./result.js";
import { z } from "zod";

export function zodParse<T extends z.ZodTypeAny>(schema: T, data: any): Result<z.infer<T>, string> {
	const parsed = schema.safeParse(data);
	if (!parsed.success)
		return Result.Err(parsed.error.message);
	return Result.Ok(parsed.data);
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