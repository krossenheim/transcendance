/// /public_api/*
export const pub_url = {
	http: {
		auth: {
			validateTokenUrl: "/public_api/auth/validate_token",
			createGuestUser: "/public_api/auth/create/guest",
			createUser: "/public_api/auth/create/user",
		}
	}
}

/// /api/*
export const user_url = {
	ws: {
		chat: {
			// createChatRoom: "/api/chat/rooms/create",
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