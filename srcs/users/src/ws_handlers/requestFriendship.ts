import { UserFriendshipStatusEnum } from "@app/shared/api/service/db/friendship";
import { int_url, user_url } from "@app/shared/api/service/common/endpoints";
import { getUsersById, retrieveUserConnectionStatus } from "../userUtils.js";
import { Result } from "@app/shared/api/service/common/result";
import { OurSocket } from "@app/shared/socket_to_hub";

import containers from "@app/shared/internal_api";

import type { FullUserType } from "@app/shared/api/service/db/user";

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

// {"funcId":"request_friendship","payload":2,"target_container":"users"}
export function wsRequestFriendshipHandlers(socket: OurSocket) {
  socket.registerHandler(
    user_url.ws.users.requestFriendship,
    async (body, response) => {
      const usersMapResult = await getUsersById([
        body.user_id,
        body.payload,
      ]);
      if (usersMapResult.isErr()) return Result.Err(usersMapResult.unwrapErr());

      const me = usersMapResult.unwrap()[body.user_id];
      const friend = usersMapResult.unwrap()[body.payload];
      if (me === undefined || friend === undefined)
        return Result.Ok(response.select("UserDoesNotExist").reply({
          message: "User not found",
        }));

      const friendshipResult = await requestUserFriendship(me, friend);
      console.log("Friendship request result:", friendshipResult);
      switch (friendshipResult.result) {
        case FriendshipCreationResult.SameUser:
        case FriendshipCreationResult.AlreadyFriends:
        case FriendshipCreationResult.PendingRequestExists:
        case FriendshipCreationResult.UserBlocked:
          return Result.Ok(response.select("InvalidStatusRequest").reply({
            message: "Invalid friendship status request",
          }));
        case FriendshipCreationResult.FailedToUpdate:
          return Result.Ok(response.select("InvalidStatusRequest").reply({
            message: "Failed to update friendship status",
          }));
      }

      socket.invokeHandler(
        user_url.ws.users.fetchUserConnections,
        [me.id, friend.id],
        null
      );

      return Result.Ok(response.select("ConnectionUpdated").reply(null));
    }
  );
}