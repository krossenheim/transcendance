import { userIdValue } from '../common/zodRules.js';
import { z } from 'zod';

export enum UserFriendshipStatusEnum {
	None = 0,
	Pending = 1,
	Accepted = 2
}

export const UserFriendshipStatus = z.enum(UserFriendshipStatusEnum);

export const UpdateFriendshipStatusSchema = z.object({
	userId: userIdValue,
	friendId: userIdValue,
	status: UserFriendshipStatus
}).strict();

export const RequestUpdateFriendship = z.object({
	friendId: userIdValue,
	status: UserFriendshipStatus
}).strict();

export type UpdateFriendshipStatusType = z.infer<typeof UpdateFriendshipStatusSchema>;

export default {
	UpdateFriendshipStatusSchema
};