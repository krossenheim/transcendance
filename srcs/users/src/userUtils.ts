import { UserFriendshipStatusEnum } from "@app/shared/api/service/db/friendship";
import type { ErrorResponseType } from "@app/shared/api/service/common/error";
import type { FullUserType } from "@app/shared/api/service/db/user";
import { Result } from "@app/shared/api/service/common/result";
import containers from "@app/shared/internal_api";

async function getUsersById(
  userIds: number[]
): Promise<Result<Map<number, FullUserType>, ErrorResponseType>> {
  if (userIds.length === 0)
    return Result.Ok(new Map());

  const usersResult = await containers.db.fetchMultipleUsers(userIds);
  if (usersResult.isErr())
    return Result.Err(usersResult.unwrapErr());

  const usersMap: Map<number, FullUserType> = new Map();
  for (const user of usersResult.unwrap())
    usersMap.set(user.id, user);

  if (userIds.some((id) => !usersMap.has(id)))
    return Result.Err({ message: "Some users not found" });

  return Result.Ok(usersMap);
}

type ResolveValue<V> = V extends number ? FullUserType : V;

type ResolvedUsers<T extends Record<string, number | FullUserType>> = {
  [Index in keyof T]: ResolveValue<T[Index]>;
};

async function resolveUsers<T extends Record<string, number | FullUserType>>(
  input: T
): Promise<Result<ResolvedUsers<T>, ErrorResponseType>> {
  const idsToFetch = Object.values(input).filter((value): value is number => typeof value === "number");
  return (await getUsersById(idsToFetch)).map((fetchedUserMap) => {
    const output: Record<string, FullUserType> = {};
    for (const [key, value] of Object.entries(input)) {
      if (typeof value === "number") {
        output[key] = fetchedUserMap.get(value)!;
      } else {
        output[key] = value;
      }
    }
    return output as ResolvedUsers<T>;
  });
}

function retrieveUserConnectionStatus(
  from: FullUserType,
  to: FullUserType
): UserFriendshipStatusEnum {
  const friendship = from.friends.find((f) => f.friendId === to.id);
  if (friendship === undefined) return UserFriendshipStatusEnum.None;
  return friendship.status;
}

export { getUsersById, retrieveUserConnectionStatus, resolveUsers };