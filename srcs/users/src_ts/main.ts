import { AuthClientRequest } from "./utils/api/service/common/clientRequest.js";
import { createFastify } from "./utils/api/service/common/fastify.js";
import containers from "./utils/internal_api.js";

import type { FastifyInstance } from "fastify";
import { userIdValue } from "./utils/api/service/common/zodRules.js";
import { FullUser } from "./utils/api/service/db/user.js";
import { ErrorResponse } from "./utils/api/service/common/error.js";
import type { ZodSchema } from "./utils/api/service/common/zodUtils.js";
import { z } from "zod";

const fastify: FastifyInstance = createFastify();

const fetchUserDataSchema = {
	body: AuthClientRequest(userIdValue),
	response: {
		200: z.array(FullUser),
		401: ErrorResponse,
		404: ErrorResponse,
		500: ErrorResponse,
	}
};

fastify.post<ZodSchema<typeof fetchUserDataSchema>>(
	"/api/fetch/:userId",
	{ schema: fetchUserDataSchema },
	async (request, reply) => {
		console.log("Received request to /api/fetch/:userId");
		console.log("Request body:", request.body);
		const requestingUser = await containers.db.fetchUserData(request.body.userId);
		const targetUser = await containers.db.fetchUserData(request.body.payload);
		if (requestingUser.isErr() || targetUser.isErr()) {
			return reply.status(404).send({ message: "User not found" });
		}
		return reply.status(200).send([requestingUser.unwrap(), targetUser.unwrap()]);
	}
)

const port = parseInt(process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || "3000", 10);
const host = process.env.AUTH_BIND_TO || "0.0.0.0";

fastify.listen({ port, host }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`Server listening at ${address}`);
});
