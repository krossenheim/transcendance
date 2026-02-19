import { userIdValue } from "@app/shared/api/service/common/zodRules";
import { RoomSchema } from "../chat/db_models";
import { Friend } from "./user";
import { z } from "zod";

export const PendingFriendshipRequestMetadataSchema = z.object({
	fromUserId: userIdValue,
	timestamp: z.number(),
});
export type PendingFriendshipRequestMetadataType = z.infer<typeof PendingFriendshipRequestMetadataSchema>;

export const PendingFriendshipRequest = PendingFriendshipRequestMetadataSchema.extend({
	user: Friend
});

export type PendingFriendshipRequestType = z.infer<typeof PendingFriendshipRequest>;

export const UserNotifications = z.object({
	pendingFriendRequests: z.array(Friend),
	pendingRoomInvites: z.array(RoomSchema),
})

export type UserNotificationsType = z.infer<typeof UserNotifications>;
