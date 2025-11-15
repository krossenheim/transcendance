import { UserFriendshipStatusEnum } from "../utils/api/service/db/friendship.js";
import { int_url, user_url } from "../utils/api/service/common/endpoints.js";
import { getUsersById, retrieveUserConnectionStatus } from "../userUtils.js";
import { Result } from "../utils/api/service/common/result.js";
import { OurSocket } from "../utils/socket_to_hub.js";

import containers from "../utils/internal_api.js";

import type { FullUserType } from "../utils/api/service/db/user.js";

export enum RemoveFriendshipResult {
  Success,
  SameUser,
  NotFriends,
  FailedToUpdate,
}

export type RemoveFriendshipResponse =
  | { result: RemoveFriendshipResult.Success, usersUpdated: number[] }
  | { result: RemoveFriendshipResult.SameUser }
  | { result: RemoveFriendshipResult.NotFriends }
  | { result: RemoveFriendshipResult.FailedToUpdate };

async function removeFriendship(
  remover: FullUserType,
  friend: FullUserType,
): Promise<RemoveFriendshipResponse> {
  if (remover.id === friend.id)
    return { result: RemoveFriendshipResult.SameUser };

  const existingStatus = retrieveUserConnectionStatus(remover, friend);
  if (existingStatus !== UserFriendshipStatusEnum.Accepted)
    return { result: RemoveFriendshipResult.NotFriends };

  // Remove friendship from both sides
  const updates = [
    { userId: remover.id, friendId: friend.id, status: UserFriendshipStatusEnum.None },
    { userId: friend.id, friendId: remover.id, status: UserFriendshipStatusEnum.None }
  ];

  const storageResult = await containers.db.post(
    int_url.http.db.updateUserConnectionStatus,
    updates
  );

  if (storageResult.isErr())
    return { result: RemoveFriendshipResult.FailedToUpdate };

  return { result: RemoveFriendshipResult.Success, usersUpdated: [remover.id, friend.id] };
}

export function wsRemoveFriendshipHandlers(socket: OurSocket) {
  socket.registerHandler(
    user_url.ws.users.removeFriendship,
    async (body, schema) => {
      const usersMapResult = await getUsersById([
        body.user_id,
        body.payload
      ]);

      if (usersMapResult.isErr()) return Result.Err(usersMapResult.unwrapErr());

      const me = usersMapResult.unwrap()[body.user_id];
      const friend = usersMapResult.unwrap()[body.payload];
      if (me === undefined || friend === undefined) {
        return Result.Ok({
          recipients: [body.user_id],
          code: schema.output.UserDoesNotExist.code,
          payload: { message: "User not found" },
        });
      }

      const removeResult = await removeFriendship(me, friend);
      console.log("Remove friendship result:", removeResult);
      
      switch (removeResult.result) {
        case RemoveFriendshipResult.NotFriends:
          return Result.Ok({
            recipients: [body.user_id],
            code: schema.output.NotFriends.code,
            payload: { message: "You are not friends with this user" },
          });
        case RemoveFriendshipResult.SameUser:
          return Result.Ok({
            recipients: [body.user_id],
            code: schema.output.UserDoesNotExist.code,
            payload: { message: "Cannot remove yourself" },
          });
        case RemoveFriendshipResult.FailedToUpdate:
          return Result.Ok({
            recipients: [body.user_id],
            code: schema.output.FailedToUpdate.code,
            payload: { message: "Failed to update friendship status" },
          });
        case RemoveFriendshipResult.Success:
          // Notify both users to refresh their connections
          socket.invokeHandler(
            user_url.ws.users.fetchUserConnections,
            removeResult.usersUpdated,
            null
          );
          break;
      }

      return Result.Ok({
        recipients: [body.user_id],
        code: schema.output.ConnectionUpdated.code,
        payload: null,
      });
    }
  );
}
