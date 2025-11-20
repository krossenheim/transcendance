import { UserFriendshipStatusEnum } from "./utils/api/service/db/friendship.js";
import type { ErrorResponseType } from "./utils/api/service/common/error.js";
import type { FullUserType } from "./utils/api/service/db/user.js";
import { Result } from "./utils/api/service/common/result.js";
import containers from "./utils/internal_api.js";

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