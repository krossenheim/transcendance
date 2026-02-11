import { userIdValue } from "@app/shared/api/service/common/zodRules";
import { RoomSchema } from "../chat/db_models";
import { Friend } from "./user";
import { z } from "zod";

export const PendingFriendshipRequest = z.object({
	fromUserId: userIdValue,
	timestamp: z.number(),
	user: Friend
});

export type PendingFriendshipRequestType = z.infer<typeof PendingFriendshipRequest>;

export const UserNotifications = z.object({
	pendingFriendRequests: z.array(PendingFriendshipRequest),
	pendingRoomInvites: z.array(RoomSchema),
})

export type UserNotificationsType = z.infer<typeof UserNotifications>;
