import { UserFriendshipStatusEnum } from "@app/shared/api/service/db/friendship";
import { int_url, user_url } from "@app/shared/api/service/common/endpoints";
import { getUsersById, retrieveUserConnectionStatus } from "../userUtils.js";
import { Result } from "@app/shared/api/service/common/result";
import { OurSocket } from "@app/shared/socket_to_hub";

import containers from "@app/shared/internal_api";

import type { FullUserType } from "@app/shared/api/service/db/user";

export enum BlockUserResult {
  Success,
  SameUser,
  AlreadyBlocked,
  FailedToUpdate,
  SystemUser,
};

export type BlockUserResponse =
  | { result: BlockUserResult.Success, usersUpdated: number[] }
  | { result: BlockUserResult.SameUser }
  | { result: BlockUserResult.AlreadyBlocked }
  | { result: BlockUserResult.FailedToUpdate }
  | { result: BlockUserResult.SystemUser };

async function blockUser(
  blocker: FullUserType,
  target: FullUserType,
): Promise<BlockUserResponse> {
  if (blocker.id === target.id)
    return { result: BlockUserResult.SameUser };

  if (target.id === 1)
    return { result: BlockUserResult.SystemUser };

  const existingStatus = retrieveUserConnectionStatus(blocker, target);
  if (existingStatus === UserFriendshipStatusEnum.Blocked)
    return { result: BlockUserResult.AlreadyBlocked };

  let updates = [{ userId: blocker.id, friendId: target.id, status: UserFriendshipStatusEnum.Blocked }];
  const reverseStatus = retrieveUserConnectionStatus(target, blocker);
  if (reverseStatus !== UserFriendshipStatusEnum.Blocked)
    updates.push({ userId: target.id, friendId: blocker.id, status: UserFriendshipStatusEnum.None });

  const storageResult = await containers.db.post(
    int_url.http.db.updateUserConnectionStatus,
    updates
  );

  if (storageResult.isErr())
    return { result: BlockUserResult.FailedToUpdate };

  return { result: BlockUserResult.Success, usersUpdated: updates.map(u => u.userId) };
}

// {"funcId":"block_user","payload":2,"target_container":"users"}
export function wsBlockUserHandlers(socket: OurSocket) {
  socket.registerHandler(
    user_url.ws.users.blockUser,
    async (body, response) => {
      const usersMapResult = await getUsersById([
        body.user_id,
        body.payload
      ]);

      if (usersMapResult.isErr()) return Result.Err(usersMapResult.unwrapErr());

      const me = usersMapResult.unwrap()[body.user_id];
      const blockedUser = usersMapResult.unwrap()[body.payload];
      if (me === undefined || blockedUser === undefined) {
        return Result.Ok(response.select("UserDoesNotExist").reply({
          message: "User not found",
        }));
      }

      const blockResult = await blockUser(me, blockedUser);
      console.log("Block user result:", blockResult);
      switch (blockResult.result) {
        case BlockUserResult.AlreadyBlocked:
        case BlockUserResult.SameUser:
        case BlockUserResult.SystemUser:
          return Result.Ok(response.select("InvalidStatusRequest").reply({
            message: "Invalid friendship status request",
          }));
        case BlockUserResult.FailedToUpdate:
          return Result.Ok(response.select("InvalidStatusRequest").reply({
            message: "Failed to update friendship status",
          }));
        case BlockUserResult.Success:
          console.log("Block successful, usersUpdated:", blockResult.usersUpdated);
          socket.invokeHandler(
            user_url.ws.users.fetchUserConnections,
            blockResult.usersUpdated,
            null
          );
      }

      return Result.Ok(response.select("ConnectionUpdated").reply(null));
    }
  );
}