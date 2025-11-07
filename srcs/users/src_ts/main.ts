import { createFastify, registerRoute } from "./utils/api/service/common/fastify.js";
import { user_url, int_url } from "./utils/api/service/common/endpoints.js";
import { Result } from "./utils/api/service/common/result.js";
import { OurSocket } from "./utils/socket_to_hub.js";

import containers from "./utils/internal_api.js";

import type { FastifyInstance } from "fastify";

const fastify: FastifyInstance = createFastify();
const socketToHub = new OurSocket("users");

import { wsBlockUserHandlers } from "./ws_handlers/blockUser.js";
socketToHub.register(wsBlockUserHandlers);

import { wsConfirmFriendshipHandlers } from "./ws_handlers/confirmFriendship.js";
socketToHub.register(wsConfirmFriendshipHandlers);

import { wsFetchUserConnectionsHandlers } from "./ws_handlers/fetchUserConnections.js";
socketToHub.register(wsFetchUserConnectionsHandlers);

import { wsRequestFriendshipHandlers } from "./ws_handlers/requestFriendship.js";
socketToHub.register(wsRequestFriendshipHandlers);

import { wsUserProfileHandlers } from "./ws_handlers/userProfile.js";
socketToHub.register(wsUserProfileHandlers);

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
  user_url.http.users.fetchUserAvatar,
  async (request, reply) => {
    console.log(request.body);
    const fetchResult = await containers.db.get(
      int_url.http.db.getUserPfp,
      undefined,
      { userId: String(request.body.payload) }
    );
    if (fetchResult.isErr()) {
      reply.code(500).send({ message: "Internal server error" });
      return;
    }

    const result = fetchResult.unwrap();
    if (result.status !== 200) {
      reply.code(result.status).send({ message: "Failed to fetch user avatar" });
      return;
    }

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