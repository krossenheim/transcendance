import { UserFriendshipStatusEnum } from "../utils/api/service/db/friendship.js";
import { int_url, user_url } from "../utils/api/service/common/endpoints.js";
import { getUsersById, retrieveUserConnectionStatus } from "../userUtils.js";
import { Result } from "../utils/api/service/common/result.js";
import { OurSocket } from "../utils/socket_to_hub.js";

import containers from "../utils/internal_api.js";

import type { FullUserType } from "../utils/api/service/db/user.js";

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
    case UserFriendshipStatusEnum.None:
      return { result: ConfirmFriendshipResult.NoPendingInvite };
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

      const confirmResult = await confirmUserFriendship(me, friend);
      console.log("Friendship confirmation result:", confirmResult);
      switch (confirmResult.result) {
        case ConfirmFriendshipResult.SameUser:
        case ConfirmFriendshipResult.UserBlocked:
        case ConfirmFriendshipResult.NoPendingInvite:
        case ConfirmFriendshipResult.AlreadyConfirmed:
          return Result.Ok({
            recipients: [body.user_id],
            code: schema.output.InvalidStatusRequest.code,
            payload: { message: "Invalid friendship status request" },
          });
        case ConfirmFriendshipResult.FailedToUpdate:
          return Result.Ok({
            recipients: [body.user_id],
            code: schema.output.InvalidStatusRequest.code,
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