import { userIdValue } from "../common/zodRules.js";
import { z } from 'zod';

export const Friend = z.object({
	id: userIdValue,
	username: z.string(),
	alias: z.string().nullable(),
	hasAvatar: z.coerce.boolean()
});

export const User = z.object({
	id: userIdValue,
	createdAt: z.number(),
	username: z.string(),
	alias: z.string().nullable(),
	email: z.string(),
	isGuest: z.coerce.boolean(),
	hasAvatar: z.coerce.boolean()
});

export const FullUser = User.extend({
	friends: z.array(Friend)
});

export const UserAuthData = z.object({
	id: userIdValue,
	passwordHash: z.string().nullable(),
	isGuest: z.coerce.boolean()
});

export const GetUser = z.object({
	userId: userIdValue
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