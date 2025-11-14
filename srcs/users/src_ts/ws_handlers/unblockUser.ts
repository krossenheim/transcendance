import { UserFriendshipStatusEnum } from "../utils/api/service/db/friendship.js";
import { int_url, user_url } from "../utils/api/service/common/endpoints.js";
import { getUsersById, retrieveUserConnectionStatus } from "../userUtils.js";
import { Result } from "../utils/api/service/common/result.js";
import { OurSocket } from "../utils/socket_to_hub.js";

import containers from "../utils/internal_api.js";

import type { FullUserType } from "../utils/api/service/db/user.js";

export enum UnblockUserResult {
  Success,
  SameUser,
  NotBlocked,
  FailedToUpdate,
};

export type UnblockUserResponse =
  | { result: UnblockUserResult.Success, usersUpdated: number[] }
  | { result: UnblockUserResult.SameUser }
  | { result: UnblockUserResult.NotBlocked }
  | { result: UnblockUserResult.FailedToUpdate };

async function unblockUser(
  me: FullUserType,
  target: FullUserType,
): Promise<UnblockUserResponse> {
  if (me.id === target.id)
    return { result: UnblockUserResult.SameUser };

  const existingStatus = retrieveUserConnectionStatus(me, target);
  if (existingStatus !== UserFriendshipStatusEnum.Blocked)
    return { result: UnblockUserResult.NotBlocked };

  const updates = [{ userId: me.id, friendId: target.id, status: UserFriendshipStatusEnum.None }];
  const storageResult = await containers.db.post(
    int_url.http.db.updateUserConnectionStatus,
    updates
  );

  if (storageResult.isErr())
    return { result: UnblockUserResult.FailedToUpdate };

  return { result: UnblockUserResult.Success, usersUpdated: updates.map(u => u.userId) };
}

// {"funcId":"unblock_user","payload":2,"target_container":"users"}
export function wsUnblockUserHandlers(socket: OurSocket) {
  socket.registerHandler(
    user_url.ws.users.unblockUser,
    async (body, schema) => {
      const usersMapResult = await getUsersById([
        body.user_id,
        body.payload
      ]);

      if (usersMapResult.isErr()) return Result.Err(usersMapResult.unwrapErr());

      const me = usersMapResult.unwrap()[body.user_id];
      const other = usersMapResult.unwrap()[body.payload];
      if (me === undefined || other === undefined) {
        return Result.Ok({
          recipients: [body.user_id],
          code: schema.output.UserDoesNotExist.code,
          payload: { message: "User not found" },
        });
      }

      const res = await unblockUser(me, other);
      switch (res.result) {
        case UnblockUserResult.SameUser:
        case UnblockUserResult.NotBlocked:
          return Result.Ok({
            recipients: [body.user_id],
            code: schema.output.InvalidStatusRequest.code,
            payload: { message: "Invalid friendship status request" },
          });
        case UnblockUserResult.FailedToUpdate:
          return Result.Ok({
            recipients: [body.user_id],
            code: schema.output.InvalidStatusRequest.code,
            payload: { message: "Failed to update friendship status" },
          });
        case UnblockUserResult.Success:
          socket.invokeHandler(
            user_url.ws.users.fetchUserConnections,
            res.usersUpdated,
            null
          );
      }

      return Result.Ok({
        recipients: [body.user_id],
        code: schema.output.ConnectionUpdated.code,
        payload: null,
      });
    }
  );
}
