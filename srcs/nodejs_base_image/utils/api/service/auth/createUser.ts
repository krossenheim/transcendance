import { z } from 'zod';

export const CreateUser = z.object({
	username: z.string(),
	email: z.email(),
	password: z.string(),
});

export type CreateUserType = z.infer<typeof CreateUser>;

export default {
	CreateUser,
};