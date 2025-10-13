import { SendMessagePayloadSchema } from "../chat/chat_interfaces.js";
import { StoredMessageSchema } from "../chat/db_models.js";
import { ErrorResponse } from "./error.js";

/// /public_api/*
export const pub_url = {
	http: {
		auth: {
			validateTokenUrl: "/public_api/auth/validate_token",
			createGuestUser: "/public_api/auth/create/guest",
			createUser: "/public_api/auth/create/user",
			loginUser: "/public_api/auth/login",
			refreshToken: "/public_api/auth/refresh",
		}
	}
}

// client
const sendMessage = {
	code: {
		MessageSent: 0,
		NotInRoom: 1,
		InvalidInput: 2
	},
	funcId: "/api/chat/send_message_to_room", args: SendMessagePayloadSchema, replies:
	{
		0: StoredMessageSchema,
		1: ErrorResponse,
		2: ErrorResponse,
	}
};

export const user_url = {
	ws: {
		chat:
		{
			addNewRoom: "/api/chat/addNewRoom",
			listRooms: "/api/chat/list_rooms",
			sendMessage: sendMessage, // "/api/chat/send_message_to_room",
			addToRoom: "/api/chat/add_to_room",
		}
	}
}

/// /internal_api/*
export const int_url = {
	http: {
		db: {
			// Userdata endpoints
			listUsers: "/internal_api/db/users", // DEBUG ONLY
			loginUser: "/internal_api/db/users/login",
			fetchMe: "/internal_api/db/users/me",
			getUser: "/internal_api/db/users/fetch/:userId",
			createNormalUser: "/internal_api/db/users/create/normal",
			createGuestUser: "/internal_api/db/users/create/guest",

			// Tokendata endpoints
			validateToken: "/internal_api/db/users/validate_token",
			storeToken: "/internal_api/db/users/store_token",

			// Chatdata endpoints
			createChatRoom: "/internal_api/chat/rooms/create",
			getRoomMessages: "/internal_api/chat/rooms/get_messages",

		}
	}
}