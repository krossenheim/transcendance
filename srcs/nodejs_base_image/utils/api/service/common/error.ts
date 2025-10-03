import { z } from 'zod';

export const ErrorResponse = z.object({
	code: z.number().optional(),
	message: z.string(),
}).strict();

export type ErrorResponseType = z.infer<typeof ErrorResponse>;

export default {
	ErrorResponse,
};