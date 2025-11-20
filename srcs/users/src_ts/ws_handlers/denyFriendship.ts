import { UserFriendshipStatusEnum } from "../utils/api/service/db/friendship.js";
import { int_url, user_url } from "../utils/api/service/common/endpoints.js";
import { getUsersById, retrieveUserConnectionStatus } from "../userUtils.js";
import { Result } from "../utils/api/service/common/result.js";
import { OurSocket } from "../utils/socket_to_hub.js";

import containers from "../utils/internal_api.js";

import type { FullUserType } from "../utils/api/service/db/user.js";

export enum DenyFriendshipResult {
  Success,
  SameUser,
  NoPendingInvite,
  FailedToUpdate
};

export type DenyFriendshipResponse =
  | { result: DenyFriendshipResult.Success }
  | { result: DenyFriendshipResult.SameUser }
  | { result: DenyFriendshipResult.NoPendingInvite }
  | { result: DenyFriendshipResult.FailedToUpdate }

async function denyUserFriendshipRequest(
  confirmer: FullUserType,
  requester: FullUserType,
): Promise<DenyFriendshipResponse> {
  if (confirmer.id === requester.id)
	return { result: DenyFriendshipResult.SameUser };

  const reverseStatus = retrieveUserConnectionStatus(requester, confirmer);
  if (reverseStatus !== UserFriendshipStatusEnum.Pending)
	return { result: DenyFriendshipResult.NoPendingInvite };

  const storageResult = await containers.db.post(
	int_url.http.db.updateUserConnectionStatus,
	[{ userId: requester.id, friendId: confirmer.id, status: UserFriendshipStatusEnum.None }]
  );

  if (storageResult.isErr()) {
	return { result: DenyFriendshipResult.FailedToUpdate };
  }

  return { result: DenyFriendshipResult.Success };
}

// {"funcId":"deny_friendship","payload":1,"target_container":"users"}
export function wsDenyFriendshipHandlers(socket: OurSocket) {
  socket.registerHandler(
	user_url.ws.users.denyFriendship,
	async (body, schema) => {
	  const usersMapResult = await getUsersById([
		body.user_id,
		body.payload,
	  ]);
	  if (usersMapResult.isErr()) return Result.Err(usersMapResult.unwrapErr());

	  const me = usersMapResult.unwrap()[body.user_id];
	  const friend = usersMapResult.unwrap()[body.payload];
	  if (me === undefined || friend === undefined)
		return Result.Ok({
		  recipients: [body.user_id],
		  code: schema.output.UserDoesNotExist.code,
		  payload: { message: "User not found" },
		});

	  const confirmResult = await denyUserFriendshipRequest(me, friend);
	  console.log("Friendship confirmation result:", confirmResult);
	  switch (confirmResult.result) {
		case DenyFriendshipResult.SameUser:
		case DenyFriendshipResult.NoPendingInvite:
		  return Result.Ok({
			recipients: [body.user_id],
			code: schema.output.NoPendingRequest.code,
			payload: { message: "Invalid friendship status request" },
		  });
		case DenyFriendshipResult.FailedToUpdate:
		  return Result.Ok({
			recipients: [body.user_id],
			code: schema.output.FailedToUpdate.code,
			payload: { message: "Failed to update friendship status" },
		  });
	  }

	  socket.invokeHandler(
		user_url.ws.users.fetchUserConnections,
		[me.id, friend.id],
		null
	  );

	  return Result.Ok({
		recipients: [body.user_id],
		code: schema.output.ConnectionUpdated.code,
		payload: null,
	  });
	}
  );
}