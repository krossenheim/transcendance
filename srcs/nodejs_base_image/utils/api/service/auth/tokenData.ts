import { z } from 'zod';

export const TokenData = z.object({
	jwt: z.string(),
	refresh: z.string().optional(),
});

export type TokenDataType = z.infer<typeof TokenData>;

export default {
	TokenData,
};