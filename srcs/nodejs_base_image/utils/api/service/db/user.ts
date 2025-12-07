import { UserFriendshipStatus } from "./friendship.js";
import { userIdValue } from "../common/zodRules.js";
import { z } from 'zod';

export enum UserAccountType {
	System = 0,
	Guest = 1,
	User = 2,
};

export const Friend = z.object({
	id: userIdValue,
	friendId: userIdValue,
	username: z.string(),
	alias: z.string().nullable(),
	bio: z.string().nullable(),
	avatarUrl: z.string().nullable(),
	status: UserFriendshipStatus,
	createdAt: z.number(),
	onlineStatus: z.number().optional()
});

export const User = z.object({
	id: userIdValue,
	createdAt: z.number(),
	username: z.string(),
	alias: z.string().nullable(),
	email: z.string(),
	bio: z.string().nullable(),
	accountType: z.nativeEnum(UserAccountType),
	avatarUrl: z.string().nullable(),
	has2FA: z.coerce.boolean().optional(),
});

export const PublicUserData = User.omit({
	email: true,
	accountType: true
});

export const FullUser = User.extend({
	friends: z.array(Friend)
});

export const UserAuthData = z.object({
	id: userIdValue,
	passwordHash: z.string().nullable(),
	accountType: z.nativeEnum(UserAccountType)
});

export const GetUser = z.object({
	userId: userIdValue
}).strict();

export const UpdateUserData = z.object({
	bio: z.string().optional(),
	alias: z.string().optional(),
	email: z.string().optional(),
	pfp: z.object({
		filename: z.string(),
		data: z.string(), // base64 encoded image data
	}).optional(),
}).strict();

export type FriendType = z.infer<typeof Friend>;
export type UserType = z.infer<typeof User>;
export type FullUserType = z.infer<typeof FullUser>;
export type UserAuthDataType = z.infer<typeof UserAuthData>;
export type GetUserType = z.infer<typeof GetUser>;
export type PublicUserDataType = z.infer<typeof PublicUserData>;
export type UpdateUserDataType = z.infer<typeof UpdateUserData>;

export default {
	UserAccountType,
	User,
	FullUser,
	UserAuthData,
	Friend,
	GetUser,
	UpdateUserData,
	PublicUserData,
};