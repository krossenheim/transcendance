import { TokenData } from '@app/shared/api/service/auth/tokenData';
import { FullUser } from '@app/shared/api/service/db/user';
import { z } from 'zod';

export const AuthResponse = z.object({
	tokens: TokenData,
	user: FullUser,
});

export type AuthResponseType = z.infer<typeof AuthResponse>;

export default {
	AuthResponse,
};