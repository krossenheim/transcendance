import { UserConnectionStatusSchema } from "./utils/api/service/db/friendship.js";
import { createFastify } from "./utils/api/service/common/fastify.js";
import containers from "./utils/internal_api.js";

import type { FastifyInstance } from "fastify";
import { registerRoute } from "./utils/api/service/common/fastify.js";
import { user_url, int_url } from "./utils/api/service/common/endpoints.js";
import { OurSocket } from "./utils/socket_to_hub.js";
import { Result } from "./utils/api/service/common/result.js";

const fastify: FastifyInstance = createFastify();
const socketToHub = new OurSocket("users");

// {"funcId":"test","payload":{},"target_container":"users"}
socketToHub.registerHandler(user_url.ws.users.test, async (body, schema) => {
	console.log("Received test event with body:", body);
	const result = Result.Ok({recipients: [body.user_id], code: schema.output.Failure.code, payload: {message: "Test successful"}});
	// socketToHub.sendMessage(user_url.ws.users.test, {recipients: [body.user_id], code: schema.output.Success.code, payload: "42"});
	return result;
});

socketToHub.registerReceiver(int_url.ws.hub.getOnlineUsers, async (body, schema) => {
	console.log("Received getOnlineUsers event with body:", body);
	return Result.Ok(null);
});

registerRoute(fastify, user_url.http.users.fetchUser, async (request, reply) => {
	const requestingUser = await containers.db.fetchUserData(request.body.userId);
	const targetUser = await containers.db.fetchUserData(request.body.payload);
	if (requestingUser.isErr() || targetUser.isErr()) {
		return reply.status(404).send({ message: "User not found" });
	}
	return reply.status(200).send([requestingUser.unwrap(), targetUser.unwrap()]);
});

registerRoute(fastify, user_url.http.users.requestFriendship, async (request, reply) => {
	const { friendId, status } = request.body.payload;
	const updateResult = await containers.db.post(int_url.http.db.updateUserFriendshipStatus, UserConnectionStatusSchema.parse({
		userId: request.body.userId,
		friendId,
		status
	}));
	if (updateResult.isErr()) {
		return reply.status(500).send({ message: "Failed to update friendship status" });
	}
	return reply.status(200).send(null);
});

const port = parseInt(process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || "3000", 10);
const host = process.env.AUTH_BIND_TO || "0.0.0.0";

fastify.listen({ port, host }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`Server listening at ${address}`);
});
