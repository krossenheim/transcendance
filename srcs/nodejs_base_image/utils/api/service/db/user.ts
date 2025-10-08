import { is } from "zod/locales";
import GameResult from "./gameResult.js"
import { z } from 'zod';

export const id_rule = z.number().gt(0);

export const Friend = z.object({
	id: id_rule,
	username: z.string(),
	alias: z.string().nullable()
});

export const User = z.object({
	id: id_rule,
	createdAt: z.number(),
	username: z.string(),
	alias: z.string().nullable(),
	email: z.string(),
	isGuest: z.number(),
});

export const FullUser = User.extend({
	friends: z.array(Friend)
});

export const UserAuthData = z.object({
	id: id_rule,
	passwordHash: z.string().nullable(),
	isGuest: z.number()
});

export const GetUser = z.object({
	userid: id_rule
}).strict();

export type FriendType = z.infer<typeof Friend>;
export type UserType = z.infer<typeof User>;
export type FullUserType = z.infer<typeof FullUser>;
export type UserAuthDataType = z.infer<typeof UserAuthData>;
export type GetUserType = z.infer<typeof GetUser>;

export default {
	User,
	FullUser,
	UserAuthData,
	Friend,
	GetUser,
};