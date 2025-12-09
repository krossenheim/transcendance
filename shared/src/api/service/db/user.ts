import { UserFriendshipStatus, UserFriendshipStatusEnum } from "@app/shared/api/service/db/friendship";
import { GameResultsWidget, type GameResultsWidgetType } from "@app/shared/api/service/db/gameResult";
import { userIdValue } from "@app/shared/api/service/common/zodRules";
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
}).strict();

export const User = z.object({
	id: userIdValue,
	createdAt: z.number(),
	username: z.string(),
	alias: z.string().nullable(),
	email: z.string(),
	bio: z.string().nullable(),
	accountType: z.enum(UserAccountType),
	avatarUrl: z.string().nullable(),
	gameResults: GameResultsWidget.nullable(),
	has2FA: z.coerce.boolean().optional(),
}).strict();

export const PublicUserData = User.omit({
	email: true,
	has2FA: true
}).extend({
	onlineStatus: z.number().nullable()
}).strict();

export const FullUser = User.extend({
	friends: z.array(Friend)
}).strict();

export const UserAuthData = z.object({
	id: userIdValue,
	passwordHash: z.string().nullable(),
	accountType: z.enum(UserAccountType)
}).strict();

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

type generatePublicUserDataMinParams = {
	id: number,
	createdAt: number,
	username: string,
	alias: string | null,
	bio: string | null,
	accountType: UserAccountType,
	avatarUrl: string | null,
	gameResults: GameResultsWidgetType | null,
}

export function generatePublicUserData<T extends generatePublicUserDataMinParams>(
	user: T,
	isOnline?: boolean
): PublicUserDataType {
	let data: PublicUserDataType = {
		id: user.id,
		createdAt: user.createdAt,
		username: user.username,
		alias: user.alias,
		bio: user.bio,
		accountType: user.accountType,
		avatarUrl: user.avatarUrl,
		gameResults: user.gameResults,
		onlineStatus: null,
	};
	if (isOnline !== undefined || user.accountType === UserAccountType.System) {
		data.onlineStatus = isOnline || user.accountType === UserAccountType.System ? 1 : 0;
	}
	return data;
}

type generateFriendDataMinParams = {
	id: number,
	username: string,
	alias: string | null,
	bio: string | null,
	avatarUrl: string | null,
	createdAt: number,
}

export function generateFriendData<T extends generateFriendDataMinParams>(
	user: T,
	status: UserFriendshipStatusEnum,
	isOnline: boolean
): FriendType {
	return {
		id: user.id,
		friendId: user.id,
		username: user.username,
		alias: user.alias,
		bio: user.bio,
		avatarUrl: user.avatarUrl,
		status: status,
		createdAt: user.createdAt,
		onlineStatus: isOnline ? 1 : 0,
	};
}

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