'use strict'
import type { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";
import { socketToHub, setSocketOnMessageHandler } from "./utils/socket_to_hub.js";
import Fastify from "fastify";

const fastify = Fastify({
  logger: {
    level: 'info', // or 'debug' for more verbosity
    transport: {
      target: 'pino-pretty', // pretty-print logs in development
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      }
    }
  }
})
import websocketPlugin from '@fastify/websocket';

fastify.register(websocketPlugin);

import PongManager from './pongManager.js';

const singletonPong = new PongManager();

const pongTasks = {
    START_A_NEW_GAME: {
    url: "/api/start_game",
    handler: singletonPong.startGame.bind(singletonPong),
    method: "POST",
  },
};

// Setup WebSocket handler
setSocketOnMessageHandler(socketToHub, { tasks: pongTasks });

// HTTP route registration function
function registerChatRoomRoutes(fastify: FastifyInstance) {
  // Iterate entries (key and value) instead of keys only
  for (const [taskKey, task] of Object.entries(pongTasks)) {
    fastify.route({
      method: task.method,
      url: task.url,
      handler: async (req: any, reply: FastifyReply) => {
        const result = await task.handler(req);
        return reply.status(333).send({"hehe" : "Hihi"});
      },
    });
  }
}

const port = parseInt(process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || '3000', 10);
const host = process.env.PONG_BIND_TO || '0.0.0.0';

fastify.listen({ port, host }, (err, address) => {
	if (err) {
		console.error(err);
		process.exit(1);
	}
	console.info(`Server listening at ${address}`);
});
