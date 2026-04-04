import { UserFriendshipStatusEnum } from "@app/shared/api/service/db/friendship";
import type { ErrorResponseType } from "@app/shared/api/service/common/error";
import type { FullUserType } from "@app/shared/api/service/db/user";
import { Result } from "@app/shared/api/service/common/result";
import containers from "@app/shared/internal_api";

async function getUsersById(
  userIds: number[]
): Promise<Result<Record<number, FullUserType>, ErrorResponseType>> {
  const usersResult = await containers.db.fetchMultipleUsers(userIds);
  if (usersResult.isErr()) return Result.Err(usersResult.unwrapErr());

  const usersMap: Record<number, FullUserType> = {};
  for (const user of usersResult.unwrap()) {
    usersMap[user.id] = user;
  }

  return Result.Ok(usersMap);
}

function retrieveUserConnectionStatus(
  from: FullUserType,
  to: FullUserType
): UserFriendshipStatusEnum {
  const friendship = from.friends.find((f) => f.friendId === to.id);
  if (friendship === undefined) return UserFriendshipStatusEnum.None;
  return friendship.status;
}

export { getUsersById, retrieveUserConnectionStatus };