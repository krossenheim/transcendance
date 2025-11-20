import { UserFriendshipStatusEnum } from "../utils/api/service/db/friendship.js";
import { int_url, user_url } from "../utils/api/service/common/endpoints.js";
import { getUsersById, retrieveUserConnectionStatus } from "../userUtils.js";
import { Result } from "../utils/api/service/common/result.js";
import { OurSocket } from "../utils/socket_to_hub.js";

import containers from "../utils/internal_api.js";

import type { FriendType, FullUserType } from "../utils/api/service/db/user.js";
import type { ErrorResponseType } from "utils/api/service/common/error.js";

export enum FriendshipCreationResult {
	Success,
	SameUser,
	AlreadyFriends,
	PendingRequestExists,
	UserBlocked,
	FailedToUpdate,
}

export type FriendshipCreationResponse =
	| { result: FriendshipCreationResult.Success }
	| { result: FriendshipCreationResult.SameUser }
	| { result: FriendshipCreationResult.AlreadyFriends }
	| { result: FriendshipCreationResult.PendingRequestExists }
	| { result: FriendshipCreationResult.UserBlocked }
	| { result: FriendshipCreationResult.FailedToUpdate };

export async function requestUserFriendship(
	requester: FullUserType,
	target: FullUserType,
): Promise<FriendshipCreationResponse> {
	if (requester.id === target.id)
		return { result: FriendshipCreationResult.SameUser };

	const existingStatus = retrieveUserConnectionStatus(requester, target);
	switch (existingStatus) {
		case UserFriendshipStatusEnum.Accepted:
			return { result: FriendshipCreationResult.AlreadyFriends };
		case UserFriendshipStatusEnum.Pending:
			return { result: FriendshipCreationResult.PendingRequestExists };
		case UserFriendshipStatusEnum.Blocked:
			return { result: FriendshipCreationResult.UserBlocked };
	}

	const reverseStatus = retrieveUserConnectionStatus(target, requester);
	if (reverseStatus === UserFriendshipStatusEnum.Blocked)
		return { result: FriendshipCreationResult.UserBlocked };

	const storageResult = await containers.db.post(
		int_url.http.db.updateUserConnectionStatus,
		[{ userId: requester.id, friendId: target.id, status: UserFriendshipStatusEnum.Pending }]
	);

	if (storageResult.isErr()) {
		return { result: FriendshipCreationResult.FailedToUpdate };
	}

	return { result: FriendshipCreationResult.Success };
}

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