import { is } from "zod/locales";
import GameResult from "./gameResult.js"
import { z } from 'zod';

export const User = z.object({
	id: z.number(),
	createdAt: z.number(),
	username: z.string(),
	email: z.string(),
	isGuest: z.number(),
});

export const FullUser = User.extend({
	gameResults: z.array(GameResult.GameResult),
});

export const RawUser = User.extend({
	passwordHash: z.string().nullable(),
});

export type UserType = z.infer<typeof User>;
export type FullUserType = z.infer<typeof FullUser>;
export type RawUserType = z.infer<typeof RawUser>;

export default {
	User,
	FullUser,
	RawUser,
};