import { Result } from "./result.js";
import { z } from "zod";

export function JSONtoZod<T extends z.ZodType>(jsonString: string, to: T): Result<z.infer<T>, string> {
  try {
	const parsed = to.parse(JSON.parse(jsonString));
	return Result.Ok(parsed);
  } catch (error) {
	return Result.Err(`Failed to parse JSON: ${(error as Error).message}`);
  }
}

export function parseJson(jsonString: string): Result<any, string> {
  try {
	const parsed: any = JSON.parse(jsonString);
	return Result.Ok(parsed);
  } catch (error) {
	return Result.Err(`Failed to parse JSON: ${(error as Error).message}`);
  }
}

export default { JSONtoZod, parseJson };