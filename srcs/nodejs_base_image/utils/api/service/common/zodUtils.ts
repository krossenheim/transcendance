import { Result } from "./result.js";
import { z } from "zod";

export function zodParse<T extends z.ZodType>(schema: T, data: any): Result<z.infer<T>, string> {
	try {
		return Result.Ok(schema.parse(data));
	} catch {
		return Result.Err("Failed to parse schema");
	}
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