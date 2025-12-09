import { UserFriendshipStatusEnum } from "@app/shared/api/service/db/friendship";
import { int_url, user_url } from "@app/shared/api/service/common/endpoints";
import { getUsersById, retrieveUserConnectionStatus } from "../userUtils.js";
import { Result } from "@app/shared/api/service/common/result";
import { OurSocket } from "@app/shared/socket_to_hub";

import containers from "@app/shared/internal_api";

import type { FullUserType } from "@app/shared/api/service/db/user";

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

      const confirmResult = await denyUserFriendshipRequest(me, friend);
      console.log("Friendship confirmation result:", confirmResult);
      switch (confirmResult.result) {
        case DenyFriendshipResult.SameUser:
        case DenyFriendshipResult.NoPendingInvite:
          return Result.Ok(response.select("NoPendingRequest").reply({
            message: "Invalid friendship status request",
          }));
        case DenyFriendshipResult.FailedToUpdate:
          return Result.Ok(response.select("FailedToUpdate").reply({
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