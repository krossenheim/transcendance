import { z } from 'zod';

export const LoginUser = z.object({
	username: z.string(),
	password: z.string(),
});

export type LoginUserType = z.infer<typeof LoginUser>;

export default {
	LoginUser,
};