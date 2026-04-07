import { UserAccountType, type FullUserType } from "@app/shared/api/service/db/user";
import { UserFriendshipStatusEnum } from "@app/shared/api/service/db/friendship";
import { int_url, user_url } from "@app/shared/api/service/common/endpoints";
import { resolveUsers, retrieveUserConnectionStatus } from "../userUtils.js";
import { Result } from "@app/shared/api/service/common/result";
import { OurSocket } from "@app/shared/socket_to_hub";

import containers from "@app/shared/internal_api";

export enum BlockUserErrorType {
  CouldNotFindTarget,
  SameUser,
  AlreadyBlocked,
  FailedToUpdate,
  SystemUser,
};

export type BlockUserValidationError =
  | { error: BlockUserErrorType.SameUser }
  | { error: BlockUserErrorType.AlreadyBlocked }
  | { error: BlockUserErrorType.SystemUser };

export type BlockUserExecutionError =
  | { error: BlockUserErrorType.FailedToUpdate }

export type BlockUserResolutionError =
  | { error: BlockUserErrorType.CouldNotFindTarget }

type BlockUserError =
  | BlockUserResolutionError
  | BlockUserValidationError
  | BlockUserExecutionError;

function isBlockingAllowed(blockingUser: FullUserType, targetUser: FullUserType): Result<null, BlockUserValidationError> {
  if (blockingUser.id === targetUser.id)
    return Result.Err({ error: BlockUserErrorType.SameUser });

  if (targetUser.accountType === UserAccountType.System || blockingUser.accountType === UserAccountType.System)
    return Result.Err({ error: BlockUserErrorType.SystemUser });

  const existingStatus = retrieveUserConnectionStatus(blockingUser, targetUser);
  if (existingStatus === UserFriendshipStatusEnum.Blocked)
    return Result.Err({ error: BlockUserErrorType.AlreadyBlocked });

  return Result.Ok(null);
}

async function executeUserBlock(blockingUser: FullUserType, targetUser: FullUserType): Promise<Result<number[], BlockUserExecutionError>> {
  const updates = [{ userId: blockingUser.id, friendId: targetUser.id, status: UserFriendshipStatusEnum.Blocked }];
  const reverseStatus = retrieveUserConnectionStatus(targetUser, blockingUser);
  if (reverseStatus !== UserFriendshipStatusEnum.Blocked)
    updates.push({ userId: targetUser.id, friendId: blockingUser.id, status: UserFriendshipStatusEnum.None });

  const storageResult = await containers.db.post(
    int_url.http.db.updateUserConnectionStatus,
    updates
  );

  if (storageResult.isErr())
    return Result.Err({ error: BlockUserErrorType.FailedToUpdate });

  return Result.Ok(updates.map(u => u.userId));
}

function notifyUsersOfBlock(socket: OurSocket, updated_users: number[]) {
  socket.invokeHandler(
    user_url.ws.users.fetchUserConnections,
    updated_users,
    null
  );
}

export async function blockUser(
  blocker: FullUserType | number,
  target: FullUserType | number,
): Promise<Result<number[], BlockUserError>> {
  const usersResult = await resolveUsers({
    blockingUser: blocker,
    targetUser: target
  });

  if (usersResult.isErr())
    return Result.Err({ error: BlockUserErrorType.CouldNotFindTarget });

  const { blockingUser, targetUser } = usersResult.unwrap();

  const allowedResult = isBlockingAllowed(blockingUser, targetUser);
  if (allowedResult.isErr())
    return allowedResult.forwardErr();

  return await executeUserBlock(blockingUser, targetUser);
}

// {"funcId":"block_user","payload":2,"target_container":"users"}
export function wsBlockUserHandlers(socket: OurSocket) {
  socket.registerHandler(
    user_url.ws.users.blockUser,
    async (body, response) => {
      const blockUserResult = await blockUser(body.userId, body.payload);

      if (blockUserResult.isOk()) {
        const usersUpdated = blockUserResult.unwrap();
        notifyUsersOfBlock(socket, usersUpdated);
        return Result.Ok(response.select("ConnectionUpdated").reply(null));
      }

      const error = blockUserResult.unwrapErr();
      switch (error.error) {
        case BlockUserErrorType.AlreadyBlocked:
        case BlockUserErrorType.SameUser:
        case BlockUserErrorType.SystemUser:
          return Result.Ok(response.select("InvalidStatusRequest").reply({
            message: "Invalid friendship status request",
          }));
        case BlockUserErrorType.FailedToUpdate:
          return Result.Ok(response.select("InvalidStatusRequest").reply({
            message: "Failed to update friendship status",
          }));
        case BlockUserErrorType.CouldNotFindTarget:
          return Result.Ok(response.select("UserDoesNotExist").reply({
            message: "Could not find user",
          }));
      }
    }
  );
}