import { z } from 'zod';

export const ErrorResponse = z.object({
	message: z.string(),
});

export type ErrorResponseType = z.infer<typeof ErrorResponse>;

export default {
	ErrorResponse,
};