import { TokenData } from './tokenData.js';
import { User } from '../db/user.js';
import { z } from 'zod';

export const AuthResponse = z.object({
	tokens: TokenData,
	user: User,
});

export type AuthResponseType = z.infer<typeof AuthResponse>;

export default {
	AuthResponse,
};