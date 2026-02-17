import { createFastify } from "@app/shared/api/service/common/fastify";
import { ChatService } from "./database/chatService";
import { TokenService } from "./database/tokenService";
import { LobbyService } from "./database/lobbyService";
import { UserService } from "./database/userService";
import Database from "./database/database";

// Setup database
const db = new Database("/etc/database_data/users.db");
const tokenService = new TokenService(db);
const lobbyService = new LobbyService(db);
const chatService = new ChatService(db);
const userService = new UserService(db, chatService);
// debug!!
// debug!!
// debug!!
// debug!!
// debug!!
import { makedebugusers } from "./debug_users";
makedebugusers(userService).catch((err) => {
  console.error("Error creating debug users:", err);
});
// debug!!
// debug!!


import { TwoFactorService } from "./database/twoFactorService.js";
const twoFactorService = new TwoFactorService(db);

// Cast to any to avoid FastifyInstance type mismatch with route plugins
const fastify: any = createFastify();

// Register routes
import userRoutes from "./routes/users.js";
fastify.register(userRoutes);

import tokenRoutes from "./routes/tokens.js";
fastify.register(tokenRoutes);

import chatRoutes from "./routes/chat.js";
fastify.register(chatRoutes);

import twoFactorRoutes from "./routes/twoFactor.js";
fastify.register(twoFactorRoutes);

import lobbyRoutes from "./routes/lobby.js";
fastify.register(lobbyRoutes);

// Run the server
const port = parseInt(
  process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || "3000",
  10
);
const host = process.env.AUTH_BIND_TO || "0.0.0.0";

fastify.listen({ port, host }, (err: any, address: any) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`Server listening at ${address}`);
});

export { db, userService, tokenService, chatService, twoFactorService, lobbyService };
