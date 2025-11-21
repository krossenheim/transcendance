import { user_url } from "../utils/api/service/common/endpoints.js";
import { Result } from "../utils/api/service/common/result.js";
import { OurSocket } from "../utils/socket_to_hub.js";

import containers from "../utils/internal_api.js";

import type { FullUserType } from "../utils/api/service/db/user.js";
import type { ErrorResponseType } from "utils/api/service/common/error.js";

// {"funcId":"user_profile","payload":2,"target_container":"users"}
export function wsUserProfileHandlers(socket: OurSocket, onlineUsers: Set<number>) {
	socket.registerHandler(
		user_url.ws.users.requestUserProfileData,
		async (body, schema) => {
			let targetUser: Result<FullUserType, ErrorResponseType> = Result.Err({message: "Invalid user identifier"});
			if (typeof body.payload !== 'number') {
				targetUser = await containers.db.fetchUserByUsername(body.payload);
			} else {
				targetUser = await containers.db.fetchUserData(body.payload);
			}
			
			if (targetUser.isErr()) {
				console.error("Error fetching user data:", targetUser.unwrapErr());
				return Result.Ok({
					recipients: [body.user_id],
					code: schema.output.UserDoesNotExist.code,
					payload: { message: "User not found" },
				});
			}

			const userData = targetUser.unwrap();
			return Result.Ok({
				recipients: [body.user_id],
				code: schema.output.Success.code,
				payload: {
					id: userData.id,
					createdAt: userData.createdAt,
					username: userData.username,
					alias: userData.alias,
					bio: userData.bio,
					avatarUrl: userData.avatarUrl,
					onlineStatus: onlineUsers.has(userData.id) ? 1 : 0,
					isGuest: userData.isGuest,
				},
			})
		}
	);
}