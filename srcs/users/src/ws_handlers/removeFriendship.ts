import { UserFriendshipStatusEnum } from "@app/shared/api/service/db/friendship";
import { int_url, user_url } from "@app/shared/api/service/common/endpoints";
import { getUsersById, retrieveUserConnectionStatus } from "../userUtils.js";
import { Result } from "@app/shared/api/service/common/result";
import { OurSocket } from "@app/shared/socket_to_hub";

import containers from "@app/shared/internal_api";

import type { FullUserType } from "@app/shared/api/service/db/user";

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
    async (body, response) => {
      const usersMapResult = await getUsersById([
        body.user_id,
        body.payload
      ]);

      if (usersMapResult.isErr()) return Result.Err(usersMapResult.unwrapErr());

      const me = usersMapResult.unwrap()[body.user_id];
      const friend = usersMapResult.unwrap()[body.payload];
      if (me === undefined || friend === undefined) {
        return Result.Ok(response.select("UserDoesNotExist").reply({
          message: "User not found",
        }));
      }

      const removeResult = await removeFriendship(me, friend);
      console.log("Remove friendship result:", removeResult);
      
      switch (removeResult.result) {
        case RemoveFriendshipResult.NotFriends:
          return Result.Ok(response.select("NotFriends").reply({
            message: "You are not friends with this user",
          }));
        case RemoveFriendshipResult.SameUser:
          return Result.Ok(response.select("UserDoesNotExist").reply({
            message: "Cannot remove yourself",
          }));
        case RemoveFriendshipResult.FailedToUpdate:
          return Result.Ok(response.select("FailedToUpdate").reply({
            message: "Failed to update friendship status",
          }));
        case RemoveFriendshipResult.SameUser:
          return Result.Ok(response.select("UserDoesNotExist").reply({
            message: "Cannot remove yourself",
          }));
        case RemoveFriendshipResult.FailedToUpdate:
          return Result.Ok(response.select("FailedToUpdate").reply({
            message: "Failed to update friendship status",
          }));
        case RemoveFriendshipResult.Success:
          socket.invokeHandler(
            user_url.ws.users.fetchUserConnections,
            removeResult.usersUpdated,
            null
          );
          break;
      }

      return Result.Ok(response.select("ConnectionUpdated").reply(null));
    }
  );
}
