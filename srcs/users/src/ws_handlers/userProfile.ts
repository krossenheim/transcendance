import { generatePublicUserData } from "@app/shared/api/service/db/user";
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
		async (body, response) => {
			let targetUser: Result<FullUserType, ErrorResponseType> = Result.Err({message: "Invalid user identifier"});
			if (typeof body.payload !== 'number') {
				targetUser = await containers.db.fetchUserByUsername(body.payload, true);
			} else {
				targetUser = await containers.db.fetchUserData(body.payload, true);
			}

			if (targetUser.isErr()) {
				console.error("Error fetching user data:", targetUser.unwrapErr());
				return Result.Ok(response.select("UserDoesNotExist").reply({
					message: "User not found",
				}));
			}

			const userData = targetUser.unwrap();
			return Result.Ok(response.select("Success").reply(
				generatePublicUserData(userData, onlineUsers.has(userData.id))
			));
		}
	);
}