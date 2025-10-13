import type {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
  FastifyServerOptions,
} from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { TokenService } from "./database/tokenService.js";
import { UserService } from "./database/userService.js";
import { ChatService } from "./database/chatService.js";
import { hashPassword } from "./routes/users.js";
import Database from "./database/database.js";
import Fastify from "fastify";

// Setup database
const db = new Database("/etc/database_data/users.db");
const tokenService = new TokenService(db);
const userService = new UserService(db);
const chatService = new ChatService(db);

await userService.createNewUser(
  "KALAWIuser",
  "bogus@bogii.coms",
  await hashPassword("acbaisd1434"),
  false
);
await userService.createNewUser(
  "KALAWIguest",
  "bogus@bog2ii.coms",
  await hashPassword("acbaisd1434"),
  true
);
await userService.createNewUser(
  "A",
  "bogus@bog2isi.coms",
  await hashPassword("acbaisd1434"),
  true
);

// Setup Fastify with Zod
const zodFastify = (options: FastifyServerOptions = { logger: true }) => {
  const server = Fastify(options);
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);
  return server;
};

const fastify: FastifyInstance = zodFastify();

// Register routes
import userRoutes from "./routes/users.js";
fastify.register(userRoutes);

import tokenRoutes from "./routes/tokens.js";
fastify.register(tokenRoutes);

import chatRoutes from "./routes/chat.js";
fastify.register(chatRoutes);

// Run the server
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

export { db, userService, tokenService, chatService };
