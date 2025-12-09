import { UserFriendshipStatusEnum } from "@app/shared/api/service/db/friendship";
import { int_url, user_url } from "@app/shared/api/service/common/endpoints";
import { getUsersById, retrieveUserConnectionStatus } from "../userUtils.js";
import { Result } from "@app/shared/api/service/common/result";
import { OurSocket } from "@app/shared/socket_to_hub";

import containers from "@app/shared/internal_api";

import type { FullUserType } from "@app/shared/api/service/db/user";

export enum ConfirmFriendshipResult {
  Success,
  SameUser,
  UserBlocked,
  NoPendingInvite,
  FailedToUpdate,
  AlreadyConfirmed
};

export type ConfirmFriendshipResponse =
  | { result: ConfirmFriendshipResult.Success }
  | { result: ConfirmFriendshipResult.SameUser }
  | { result: ConfirmFriendshipResult.UserBlocked }
  | { result: ConfirmFriendshipResult.NoPendingInvite }
  | { result: ConfirmFriendshipResult.FailedToUpdate }
  | { result: ConfirmFriendshipResult.AlreadyConfirmed }

async function confirmUserFriendship(
  confirmer: FullUserType,
  requester: FullUserType,
): Promise<ConfirmFriendshipResponse> {
  if (confirmer.id === requester.id)
    return { result: ConfirmFriendshipResult.SameUser };

  const existingStatus = retrieveUserConnectionStatus(confirmer, requester);
  switch (existingStatus) {
    case UserFriendshipStatusEnum.Blocked:
      return { result: ConfirmFriendshipResult.UserBlocked };
    case UserFriendshipStatusEnum.Accepted:
      return { result: ConfirmFriendshipResult.AlreadyConfirmed };
  }

  const reverseStatus = retrieveUserConnectionStatus(requester, confirmer);
  if (reverseStatus !== UserFriendshipStatusEnum.Pending)
    return { result: ConfirmFriendshipResult.NoPendingInvite };

  const storageResult = await containers.db.post(
    int_url.http.db.updateUserConnectionStatus,
    [{ userId: confirmer.id, friendId: requester.id, status: UserFriendshipStatusEnum.Accepted },
    { userId: requester.id, friendId: confirmer.id, status: UserFriendshipStatusEnum.Accepted }]
  );

  if (storageResult.isErr()) {
    return { result: ConfirmFriendshipResult.FailedToUpdate };
  }

  return { result: ConfirmFriendshipResult.Success };
}

// {"funcId":"confirm_friendship","payload":1,"target_container":"users"}
export function wsConfirmFriendshipHandlers(socket: OurSocket) {
  socket.registerHandler(
    user_url.ws.users.confirmFriendship,
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

      const confirmResult = await confirmUserFriendship(me, friend);
      console.log("Friendship confirmation result:", confirmResult);
      switch (confirmResult.result) {
        case ConfirmFriendshipResult.SameUser:
        case ConfirmFriendshipResult.UserBlocked:
        case ConfirmFriendshipResult.NoPendingInvite:
        case ConfirmFriendshipResult.AlreadyConfirmed:
          return Result.Ok(response.select("InvalidStatusRequest").reply({
            message: "Invalid friendship status request",
          }));
        case ConfirmFriendshipResult.FailedToUpdate:
          return Result.Ok(response.select("InvalidStatusRequest").reply({
            message: "Failed to update friendship status",
          }));
      };

      socket.invokeHandler(
        user_url.ws.users.fetchUserConnections,
        [me.id, friend.id],
        null
      );

      return Result.Ok(response.select("ConnectionUpdated").reply(null));
    }
  );
}