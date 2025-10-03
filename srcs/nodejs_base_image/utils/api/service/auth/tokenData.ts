import { z } from 'zod';

export const TokenData = z.object({
	jwt: z.string(),
	refresh: z.string().optional(),
});

export const SingleToken = z.object({
	token: z.string(),
}).strict();

export const TokenPayload = z.object({
	uid: z.number().min(1),
}).strict();

export type TokenDataType = z.infer<typeof TokenData>;
export type SingleTokenType = z.infer<typeof SingleToken>;

export default {
	TokenData,
	SingleToken,
};