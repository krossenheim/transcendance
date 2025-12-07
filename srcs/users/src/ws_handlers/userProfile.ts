import { user_url } from "@app/shared/api/service/common/endpoints";
import { Result } from "@app/shared/api/service/common/result";
import { OurSocket } from "@app/shared/socket_to_hub";

import containers from "@app/shared/internal_api";

import type { FullUserType } from "@app/shared/api/service/db/user";
import type { ErrorResponseType } from "@app/shared/api/service/common/error";

// {"funcId":"user_profile","payload":2,"target_container":"users"}
export function wsUserProfileHandlers(socket: OurSocket, onlineUsers: Set<number>) {
	socket.registerHandler(
		user_url.ws.users.requestUserProfileData,
		async (body, schema) => {
			let targetUser: Result<FullUserType, ErrorResponseType> = Result.Err({message: "Invalid user identifier"});
			if (typeof body.payload !== 'number') {
				targetUser = await containers.db.fetchUserByUsername(body.payload, true);
			} else {
				targetUser = await containers.db.fetchUserData(body.payload, true);
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
					accountType: userData.accountType,
				},
			})
		}
	);
}