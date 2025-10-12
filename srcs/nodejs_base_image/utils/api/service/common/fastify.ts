import Fastify, { type FastifyInstance } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";

export function createFastify(options = { logger: true }): FastifyInstance {
  const server = Fastify(options);
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  return server;
}

export default { createFastify };