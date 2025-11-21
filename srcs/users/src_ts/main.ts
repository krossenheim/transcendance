import { createFastify, registerRoute } from "./utils/api/service/common/fastify.js";
import { fetchAllowedOnlineStatusViewers } from "./ws_handlers/userOnlineStatus.js";
import { UserFriendshipStatusEnum } from "./utils/api/service/db/friendship.js";
import { user_url, int_url } from "./utils/api/service/common/endpoints.js";
import { Result } from "./utils/api/service/common/result.js";
import { OurSocket } from "./utils/socket_to_hub.js";

import containers from "./utils/internal_api.js";

import type { FriendType } from "./utils/api/service/db/user.js";
import type { FastifyInstance } from "fastify";

const fastify: FastifyInstance = createFastify();
const socketToHub = new OurSocket("users");

let onlineUsers: Set<number> = new Set();

import { wsBlockUserHandlers } from "./ws_handlers/blockUser.js";
socketToHub.register(wsBlockUserHandlers);

import { wsUnblockUserHandlers } from "./ws_handlers/unblockUser.js";
socketToHub.register(wsUnblockUserHandlers);

import { wsConfirmFriendshipHandlers } from "./ws_handlers/confirmFriendship.js";
socketToHub.register(wsConfirmFriendshipHandlers);

import { wsDenyFriendshipHandlers } from "./ws_handlers/denyFriendship.js";
socketToHub.register(wsDenyFriendshipHandlers);

import { wsRemoveFriendshipHandlers } from "./ws_handlers/removeFriendship.js";
socketToHub.register(wsRemoveFriendshipHandlers);

import { wsFetchUserConnectionsHandlers } from "./ws_handlers/fetchUserConnections.js";
wsFetchUserConnectionsHandlers(socketToHub, onlineUsers);

import { wsRequestFriendshipHandlers } from "./ws_handlers/requestFriendship.js";
socketToHub.register(wsRequestFriendshipHandlers);

import { wsUserProfileHandlers } from "./ws_handlers/userProfile.js";
wsUserProfileHandlers(socketToHub, onlineUsers);

import { updateProfile } from "./ws_handlers/updateProfile.js";
updateProfile(socketToHub);

import { wsUserOnlineStatusHandler } from "./ws_handlers/userOnlineStatus.js";
wsUserOnlineStatusHandler(socketToHub, onlineUsers);

async function handleUserConnectionUpdateNotification(userId: number, isOnline: boolean) {
  let users_to_notify = await fetchAllowedOnlineStatusViewers(userId);
  let status_code = isOnline ?
    user_url.ws.users.userOnlineStatusUpdate.schema.output.GetOnlineUsers.code :
    user_url.ws.users.userOnlineStatusUpdate.schema.output.GetOfflineUsers.code;

  socketToHub.sendMessage(
    user_url.ws.users.userOnlineStatusUpdate,
    {
      recipients: users_to_notify,
      code: status_code,
      payload: [userId],
    }
  )
}

socketToHub.registerReceiver(
  int_url.ws.hub.userConnected,
  async (data, schema) => {
    console.log("Received userConnected event with data:", data);

    if (data.code === 0) {
      const connectedUserId = data.payload.userId;
      const wasAlreadyOnline = onlineUsers.has(connectedUserId);
      onlineUsers.add(connectedUserId);

      if (!wasAlreadyOnline)
        await handleUserConnectionUpdateNotification(connectedUserId, true);

      socketToHub.invokeHandler(
        user_url.ws.users.userOnlineStatusUpdate,
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

socketToHub.registerReceiver(
  int_url.ws.hub.userDisconnected,
  async (data, schema) => {
    console.log("Received userDisconnected event with data:", data);

    if (data.code === 0) {
      const disconnectedUserId = data.payload.userId;
      const wasOnline = onlineUsers.delete(disconnectedUserId);

      if (wasOnline)
        await handleUserConnectionUpdateNotification(disconnectedUserId, false);
    }

    if (data.code === schema.output.Failure.code) {
      console.warn(
        `User disconnection from users container failed: ${data.payload.message}`
      );
    }

    return Result.Ok(null);
  }
);

registerRoute(
  fastify,
  user_url.http.users.fetchUserAvatar,
  async (request, reply) => {
    console.log(request.body);
    const fetchResult = await containers.db.post(
      int_url.http.db.getUserPfp,
      request.body.payload
    );
    console.log("Fetch result:", fetchResult);
    if (fetchResult.isErr()) {
      reply.code(500).send({ message: "Internal server error" });
      return;
    }

    const result = fetchResult.unwrap();
    if (result.status !== 200) {
      reply.code(result.status).send({ message: "Failed to fetch user avatar" });
      return;
    }

    console.log("Sending avatar with content type image/png");
    console.log(result.data);
    reply.type('data:image/png;base64');
    reply.code(200).send(result.data);
  }
);

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

export { fastify, socketToHub };