import { TokenData } from './tokenData.js';
import { FullUser } from '../db/user.js';
import { z } from 'zod';

export const AuthResponse = z.object({
	tokens: TokenData,
	user: FullUser,
});

export type AuthResponseType = z.infer<typeof AuthResponse>;

export default {
	AuthResponse,
};