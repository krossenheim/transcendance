import { userIdValue } from '../common/zodRules.js';
import { z } from 'zod';

export enum UserFriendshipStatusEnum {
	None = 0,
	Pending = 1,
	Accepted = 2,
	Blocked = 3
}

export const UserFriendshipStatus = z.nativeEnum(UserFriendshipStatusEnum);

export const UserConnectionStatusSchema = z.object({
	userId: userIdValue,
	friendId: userIdValue,
	status: UserFriendshipStatus
}).strict();

export const RequestUpdateFriendship = z.object({
	friendId: userIdValue,
}).strict();

export type UserConnectionStatusType = z.infer<typeof UserConnectionStatusSchema>;

export default {
	UpdateFriendshipStatusSchema: UserConnectionStatusSchema
};