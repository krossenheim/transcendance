import { createFastify } from "@app/shared/api/service/common/fastify";
import { TokenService } from "./database/tokenService.js";
import { UserService } from "./database/userService.js";
import { ChatService } from "./database/chatService.js";
import Database from "./database/database.js";

import type { FastifyInstance } from "fastify";

// Setup database
const db = new Database("/etc/database_data/users.db");
const tokenService = new TokenService(db);
const userService = new UserService(db);
// debug!!
// debug!!
// debug!!
// debug!!
// debug!!
import { makedebugusers } from "./debug_users.js";
makedebugusers(userService).catch((err) => {
  console.error("Error creating debug users:", err);
});
// debug!!
// debug!!

const chatService = new ChatService(db);

import { TwoFactorService } from "./database/twoFactorService.js";
const twoFactorService = new TwoFactorService(db);

const fastify: FastifyInstance = createFastify();

// Register routes
import userRoutes from "./routes/users.js";
fastify.register(userRoutes);

import tokenRoutes from "./routes/tokens.js";
fastify.register(tokenRoutes);

import chatRoutes from "./routes/chat.js";
fastify.register(chatRoutes);

import twoFactorRoutes from "./routes/twoFactor.js";
fastify.register(twoFactorRoutes);

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

export { db, userService, tokenService, chatService, twoFactorService };
