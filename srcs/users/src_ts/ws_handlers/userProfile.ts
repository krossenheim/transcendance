import { UserFriendshipStatusEnum } from "../utils/api/service/db/friendship.js";
import { int_url, user_url } from "../utils/api/service/common/endpoints.js";
import { getUsersById, retrieveUserConnectionStatus } from "../userUtils.js";
import { Result } from "../utils/api/service/common/result.js";
import { OurSocket } from "../utils/socket_to_hub.js";

import containers from "../utils/internal_api.js";

import type { FriendType, FullUserType } from "../utils/api/service/db/user.js";

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
	  const usersMapResult = await getUsersById([body.payload]);
	  if (usersMapResult.isErr()) {
		return Result.Ok({
		  recipients: [body.user_id],
		  code: schema.output.UserDoesNotExist.code,
		  payload: { message: "Failed to retrieve user data" },
		});
	  }

	  const targetUser = usersMapResult.unwrap()[body.payload];
	  if (targetUser === undefined) {
		return Result.Ok({
		  recipients: [body.user_id],
		  code: schema.output.UserDoesNotExist.code,
		  payload: { message: "User not found" },
		});
	  }

	  return Result.Ok({
		recipients: [body.user_id],
		code: schema.output.Success.code,
		payload: {
			id: targetUser.id,
			createdAt: targetUser.createdAt,
			username: targetUser.username,
			alias: targetUser.alias,
			bio: targetUser.bio,
			hasAvatar: targetUser.hasAvatar,
			onlineStatus: onlineUsers.has(targetUser.id) ? 1 : 0,
		},
	  })
	}
  );
}