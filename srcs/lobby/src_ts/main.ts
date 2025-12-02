import { createFastify } from "./utils/api/service/common/fastify.js";
import Fastify, { type FastifyInstance } from "fastify";

const fastify: FastifyInstance = createFastify();

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
