import { z } from 'zod';

export const LoginRequestBodySchema = z.object({
	username: z.string(),
	password: z.string(),
});

export type LoginRequestBody = z.infer<typeof LoginRequestBodySchema>;

export const CreateAccountRequestBodySchema = z.object({
	username: z.string(),
	email: z.email(),
	password: z.string(),
});

export type CreateAccountRequestBody = z.infer<typeof CreateAccountRequestBodySchema>;