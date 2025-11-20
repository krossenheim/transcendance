import { UserFriendshipStatus } from "./friendship.js";
import { userIdValue } from "../common/zodRules.js";
import { z } from 'zod';

export enum ChatRoomType {
	PRIVATE = 1,
	DIRECT_MESSAGE = 2
};

export const ChatRoom = z.object({
	roomId: z.number(),
	roomName: z.string(),
	roomType: z.enum(ChatRoomType),
}).strict();

export const ChatMessage = z.object({
	messageId: z.number(),
	userId: userIdValue,
	roomId: z.number(),
	messageString: z.string(),
	messageDate: z.number(),
}).strict();

export default {
	ChatRoomType,
	ChatRoom,
	ChatMessage
};