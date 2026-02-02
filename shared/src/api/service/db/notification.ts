import { userIdValue } from "@app/shared/api/service/common/zodRules";
import { Friend } from "./user";
import { z } from "zod";

export const PendingFriendshipRequest = z.object({
	fromUserId: userIdValue,
	timestamp: z.number(),
	user: Friend
});

export type PendingFriendshipRequestType = z.infer<typeof PendingFriendshipRequest>;

export const UserNotifications = z.object({
	pendingFriendRequests: z.array(PendingFriendshipRequest)
})

export type UserNotificationsType = z.infer<typeof UserNotifications>;
