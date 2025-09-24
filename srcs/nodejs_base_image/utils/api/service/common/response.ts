import { z } from 'zod';

export const ErrorResponse = z.object({
	code: z.number().optional(),
	message: z.string().optional(),
});

export type ErrorResponseType = z.infer<typeof ErrorResponse>;

export const isErrorResponse = (data: unknown): data is ErrorResponseType => {
	return ErrorResponse.safeParse(data).success;
};

export const ApiResponse = <T extends z.ZodTypeAny>(dataSchema: T) =>
	z.object({
		status: z.number(),
		data: z.union([dataSchema, ErrorResponse]),
	});

export type ApiResponse<T> = {
	status: number;
	data: T | ErrorResponseType;
};

export default {
	ErrorResponse,
	ApiResponse,
	isErrorResponse,
};