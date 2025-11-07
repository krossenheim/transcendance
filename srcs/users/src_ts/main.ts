import {
  UserConnectionStatusSchema,
  UserFriendshipStatusEnum,
} from "./utils/api/service/db/friendship.js";
import {
  createFastify,
  registerRoute,
} from "./utils/api/service/common/fastify.js";
import { user_url, int_url } from "./utils/api/service/common/endpoints.js";
import { Result } from "./utils/api/service/common/result.js";
import { OurSocket } from "./utils/socket_to_hub.js";
import containers from "./utils/internal_api.js";

import type { ErrorResponseType } from "./utils/api/service/common/error.js";
import type { FastifyInstance } from "fastify";
import { User, type FullUserType } from "./utils/api/service/db/user.js";
import { zodParse } from "./utils/api/service/common/zodUtils.js";

const fastify: FastifyInstance = createFastify();
const socketToHub = new OurSocket("users");

enum UserPermission {
  Guest = 1,
  User = 2,
  Admin = 10,
}

interface UserPermissionData {
  userPermissionScope: UserPermission;
  allowedPlayersToFetchProfile: number[];
}

interface UserMetadata {
  id: number;
  username: string;
  permissions: UserPermissionData;
}

class UserHandler {
  private users: Map<number, UserMetadata> = new Map();

  addUser(user: UserMetadata): void {
    this.users.set(user.id, user);
  }

  getUser(userId: number): Result<UserMetadata, string> {
    const user = this.users.get(userId);
    if (user === undefined) return Result.Err("User not found");
    return Result.Ok(user);
  }

  removeUser(userId: number): Result<null, string> {
    if (!this.users.has(userId)) return Result.Err("User not found");
    this.users.delete(userId);
    return Result.Ok(null);
  }
}

// interface PlayerConnection {
// userId: number;
// user
// }

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
  const friendship = from.friends.find((f) => f.id === to.id);
  if (friendship === undefined) return UserFriendshipStatusEnum.None;
  return friendship.status;
}

// {"funcId":"test","payload":{},"target_container":"users"}
socketToHub.registerHandler(user_url.ws.users.test, async (body, schema) => {
  console.log("Received test event with body:", body);
  const result = Result.Ok({
    recipients: [body.user_id],
    code: schema.output.Failure.code,
    payload: { message: "Test successful" },
  });
  socketToHub.sendMessage(user_url.ws.users.test, {
    recipients: [body.user_id],
    code: schema.output.Success.code,
    payload: "42",
  });
  return result;
});

export enum FriendshipCreationResult {
  Success,
  AlreadyFriends,
  PendingRequestExists,
  UserBlocked,
  FailedToUpdate,
}

export type FriendshipCreationResponse =
  | { result: FriendshipCreationResult.Success }
  | { result: FriendshipCreationResult.AlreadyFriends }
  | { result: FriendshipCreationResult.PendingRequestExists }
  | { result: FriendshipCreationResult.UserBlocked }
  | { result: FriendshipCreationResult.FailedToUpdate };

async function requestUserFriendship(
  requester: FullUserType,
  target: FullUserType,
): Promise<FriendshipCreationResponse> {
  const existingStatus = retrieveUserConnectionStatus(requester, target);
  switch (existingStatus) {
    case UserFriendshipStatusEnum.Accepted:
      return { result: FriendshipCreationResult.AlreadyFriends };
    case UserFriendshipStatusEnum.Pending:
      return { result: FriendshipCreationResult.PendingRequestExists };
    case UserFriendshipStatusEnum.Blocked:
      return { result: FriendshipCreationResult.UserBlocked };
  }

  const reverseStatus = retrieveUserConnectionStatus(target, requester);
  if (reverseStatus === UserFriendshipStatusEnum.Blocked)
    return { result: FriendshipCreationResult.UserBlocked };

  const storageResult = await containers.db.post(
    int_url.http.db.updateUserConnectionStatus,
    [{userId: requester.id, friendId: target.id, status: UserFriendshipStatusEnum.Pending}]
  );

  if (storageResult.isErr()) {
    return { result: FriendshipCreationResult.FailedToUpdate };
  }

  return { result: FriendshipCreationResult.Success };
}

// {"funcId":"request_friendship","payload":2,"target_container":"users"}
socketToHub.registerHandler(
  user_url.ws.users.requestFriendship,
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

    const friendshipResult = await requestUserFriendship(me, friend);
    console.log("Friendship request result:", friendshipResult);
    switch (friendshipResult.result) {
      case FriendshipCreationResult.AlreadyFriends:
      case FriendshipCreationResult.PendingRequestExists:
      case FriendshipCreationResult.UserBlocked:
        return Result.Ok({
          recipients: [body.user_id],
          code: schema.output.InvalidStatusRequest.code,
          payload: { message: "Invalid friendship status request" },
        });
      case FriendshipCreationResult.FailedToUpdate:
        return Result.Ok({
          recipients: [body.user_id],
          code: schema.output.InvalidStatusRequest.code,
          payload: { message: "Failed to update friendship status" },
        });
    }

    socketToHub.invokeHandler(
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

export enum ConfirmFriendshipResult {
  Success,
  UserBlocked,
  NoPendingInvite,
  FailedToUpdate,
  AlreadyConfirmed
};

export type ConfirmFriendshipResponse =
  | { result: ConfirmFriendshipResult.Success }
  | { result: ConfirmFriendshipResult.UserBlocked }
  | { result: ConfirmFriendshipResult.NoPendingInvite }
  | { result: ConfirmFriendshipResult.FailedToUpdate }
  | { result: ConfirmFriendshipResult.AlreadyConfirmed }

async function confirmUserFriendship(
  confirmer: FullUserType,
  requester: FullUserType,
): Promise<ConfirmFriendshipResponse> {
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
    [{userId: confirmer.id, friendId: requester.id, status: UserFriendshipStatusEnum.Accepted},
    {userId: requester.id, friendId: confirmer.id, status: UserFriendshipStatusEnum.Accepted}]
  );

  if (storageResult.isErr()) {
    return { result: ConfirmFriendshipResult.FailedToUpdate };
  }

  return { result: ConfirmFriendshipResult.Success };
}

// {"funcId":"confirm_friendship","payload":1,"target_container":"users"}
socketToHub.registerHandler(
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

    socketToHub.invokeHandler(
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

export enum BlockUserResult {
  Success,
  AlreadyBlocked,
  FailedToUpdate,
};

export type BlockUserResponse =
  | { result: BlockUserResult.Success, usersUpdated: number[] }
  | { result: BlockUserResult.AlreadyBlocked }
  | { result: BlockUserResult.FailedToUpdate };

async function blockUser(
  blocker: FullUserType,
  target: FullUserType,
): Promise<BlockUserResponse> {
  const existingStatus = retrieveUserConnectionStatus(blocker, target);
  if (existingStatus === UserFriendshipStatusEnum.Blocked)
    return { result: BlockUserResult.AlreadyBlocked };

  let updates = [{userId: blocker.id, friendId: target.id, status: UserFriendshipStatusEnum.Blocked}];
  const reverseStatus = retrieveUserConnectionStatus(target, blocker);
  if (reverseStatus !== UserFriendshipStatusEnum.Blocked)
    updates.push({userId: target.id, friendId: blocker.id, status: UserFriendshipStatusEnum.None});

  const storageResult = await containers.db.post(
    int_url.http.db.updateUserConnectionStatus,
    updates
  );

  if (storageResult.isErr())
    return { result: BlockUserResult.FailedToUpdate };

  return { result: BlockUserResult.Success, usersUpdated: updates.map(u => u.userId) };
}

// {"funcId":"block_user","payload":2,"target_container":"users"}
socketToHub.registerHandler(
  user_url.ws.users.blockUser,
  async (body, schema) => {
    const usersMapResult = await getUsersById([
      body.user_id,
      body.payload
    ]);

    if (usersMapResult.isErr()) return Result.Err(usersMapResult.unwrapErr());

    const me = usersMapResult.unwrap()[body.user_id];
    const blockedUser = usersMapResult.unwrap()[body.payload];
    if (me === undefined || blockedUser === undefined) {
      return Result.Ok({
        recipients: [body.user_id],
        code: schema.output.UserDoesNotExist.code,
        payload: { message: "User not found" },
      });
    }

    const blockResult = await blockUser(me, blockedUser);
    console.log("Block user result:", blockResult);
    switch (blockResult.result) {
      case BlockUserResult.AlreadyBlocked:
        return Result.Ok({
          recipients: [body.user_id],
          code: schema.output.InvalidStatusRequest.code,
          payload: { message: "Invalid friendship status request" },
        });
      case BlockUserResult.FailedToUpdate:
        return Result.Ok({
          recipients: [body.user_id],
          code: schema.output.InvalidStatusRequest.code,
          payload: { message: "Failed to update friendship status" },
        });
      case BlockUserResult.Success:
        socketToHub.invokeHandler(
          user_url.ws.users.fetchUserConnections,
          blockResult.usersUpdated,
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

socketToHub.registerHandler(
  user_url.ws.users.fetchUserConnections,
  async (body, schema) => {
    const connectionsResult = await containers.db.get(
      int_url.http.db.fetchUserConnections,
      { userId: body.user_id }
    );

    if (connectionsResult.isErr()) {
      return Result.Ok({
        recipients: [body.user_id],
        code: schema.output.Failure.code,
        payload: { message: "Failed to fetch user connections" },
      });
    }

    const result = connectionsResult.unwrap();
    if (result.status !== 200)
      return Result.Ok({
        recipients: [body.user_id],
        code: schema.output.Failure.code,
        payload: { message: "Failed to fetch user connections" },
      });

    return Result.Ok({
      recipients: [body.user_id],
      code: schema.output.Success.code,
      payload: zodParse(int_url.http.db.fetchUserConnections.schema.response[200], result.data).unwrapOr([]),
    });
  }
);

socketToHub.registerReceiver(
  int_url.ws.hub.userConnected,
  async (data, schema) => {
    console.log("Received userConnected event with data:", data);

    if (data.code === 0) {
      console.log(
        `User ${data.payload.userId} has opened a websocket between itself and hub.`
      );

      socketToHub.invokeHandler(
        user_url.ws.users.fetchUserConnections,
        data.payload.userId,
        null
      );
    }

    if (data.code === schema.output.Failure.code) {
      console.warn(
        `User connection to users container failed: ${data.payload.message}`
      );
    }

    return Result.Ok(null);
  }
);

registerRoute(
  fastify,
  user_url.http.users.fetchUser,
  async (request, reply) => {
    const requestingUser = await containers.db.fetchUserData(
      request.body.userId
    );
    const targetUser = await containers.db.fetchUserData(request.body.payload);
    if (requestingUser.isErr() || targetUser.isErr()) {
      return reply.status(404).send({ message: "User not found" });
    }
    return reply
      .status(200)
      .send([requestingUser.unwrap(), targetUser.unwrap()]);
  }
);

// registerRoute(
//   fastify,
//   user_url.http.users.requestFriendship,
//   async (request, reply) => {
//     const { friendId, status } = request.body.payload;
//     const updateResult = await containers.db.post(
//       int_url.http.db.updateUserFriendshipStatus,
//       UserConnectionStatusSchema.parse({
//         userId: request.body.userId,
//         friendId,
//         status,
//       })
//     );
//     if (updateResult.isErr()) {
//       return reply
//         .status(500)
//         .send({ message: "Failed to update friendship status" });
//     }
//     return reply.status(200).send(null);
//   }
// );

const port = parseInt(
  process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || "3000",
  10
);
const host = process.env.AUTH_BIND_TO || "0.0.0.0";

fastify.listen({ port, host }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`Server listening at ${address}`);
});
