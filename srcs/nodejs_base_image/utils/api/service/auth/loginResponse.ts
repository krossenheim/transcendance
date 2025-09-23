import { TokenData } from './tokenData';
import { User } from '../db/user';
import { z } from 'zod';

export const AuthResponse = z.object({
	tokens: TokenData,
	user: User,
});

export type AuthResponseType = z.infer<typeof AuthResponse>;

export default {
	AuthResponse,
};