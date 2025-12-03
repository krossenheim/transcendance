import { createFastify, registerRoute } from "./utils/api/service/common/fastify.js";
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

interface gameData {
	game: PongGame;
	lastUpdate: number;
};

import { PongGame } from "game/game.js";
const games = new Map<number, gameData>(); 

const game = new PongGame([1, 2, 3, 4, 5], {
	canvasWidth: 1000,
	canvasHeight: 1000,
	ballSpeed: 450,
	paddleSpeedFactor: 1.5,
	paddleWidthFactor: 0.15,
	paddleHeight: 40,
	paddleWallOffset: 30,
	amountOfBalls: 2,
	powerupFrequency: 10,
});
games.set(game.id, { game, lastUpdate: Date.now() });

const TICK = 1000 / 10; // 10 fps
setInterval(() => {
	games.forEach((gameData) => {
		const now = Date.now();
		const deltaTime = (now - gameData.lastUpdate) / 1000;
		socketToHub.invokeHandler(user_url.ws.pong.getGameState, gameData.game.getPlayers(), gameData.game.fetchBoardJSON())
		gameData.game.playSimulation(deltaTime);
		gameData.lastUpdate = now;
	});
}, TICK);

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