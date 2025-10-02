"use strict";
// import type { FastifyReply, FastifyInstance } from "fastify";
import {
  socketToHub,
  setSocketOnMessageHandler,
} from "./utils/socket_to_hub.js";
import Fastify from "fastify";
import PongManager from "./pongManager.js";
import websocketPlugin from "@fastify/websocket";
import type {
  TypePongBall,
  TypePongPaddle,
} from "./utils/api/service/pong/pong_interfaces.js";
import {
  PongBallSchema,
  PongPaddleSchema,
} from "./utils/api/service/pong/pong_interfaces.js";

const fastify = Fastify({
  logger: {
    level: "info", // or 'debug' for more verbosity
    transport: {
      target: "pino-pretty", // pretty-print logs in development
      options: {
        colorize: true,
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    },
  },
});
fastify.register(websocketPlugin);

const singletonPong = new PongManager();
const pongTasks = {
  START_A_NEW_GAME: {
    url: "/api/start_game",
    handler: singletonPong.startGame.bind(singletonPong),
    method: "POST",
  },
  MOVE_PADDLE: {
    url: "/api/move_paddle",
    handler: singletonPong.movePaddle.bind(singletonPong),
    method: "POST",
  },
};

// Setup WebSocket handler
setSocketOnMessageHandler(socketToHub, { tasks: pongTasks });

function truncateDecimals(num: number): number {
  return Math.trunc(num * 1000) / 1000;
}

async function backgroundTask() {
  try {
    while (true) {
      for (const [game_id, game] of singletonPong.pong_instances) {
        game.gameLoop();
        const recipients = Array.from(game.player_to_paddle.keys());
        const payload: { balls: any[]; paddles: any[] } = {
          balls: [],
          paddles: [],
        };

        for (const obj of game.pong_balls) {
          payload.balls.push({
            x: truncateDecimals(obj.pos.x),
            y: truncateDecimals(obj.pos.y),
            dx: truncateDecimals(obj.dir.x),
            dy: truncateDecimals(obj.dir.y),
            r: truncateDecimals(obj.radius),
          });
        }

        for (const obj of game.player_paddles) {
          payload.paddles.push({
            x: truncateDecimals(obj.pos.x),
            y: truncateDecimals(obj.pos.y),
            r: truncateDecimals(obj.r),
            a1: truncateDecimals(obj.segment[0]!.x),
            a2: truncateDecimals(obj.segment[0]!.y),
            b1: truncateDecimals(obj.segment[1]!.x),
            b2: truncateDecimals(obj.segment[1]!.y),
            w: obj.width,
          });
        }
        const out = { recipients: recipients, payload: payload };
        socketToHub.send(JSON.stringify(out));
      }
      await new Promise((resolve) => setTimeout(resolve, 45));
    }
  } catch (e: any) {
    console.log("Exception:", e.error);
    while (true) {}
  }
}

// Start the background task without awaiting it
backgroundTask();
const bogus = {
  user_id: 2,
  endpoint: "/api/bogus",
  payload: { player_list: [2, 3, 4, 5, 6] },
};
singletonPong.startGame(bogus);
// HTTP route registration function
// function registerChatRoomRoutes(fastify: FastifyInstance) {
//   // Iterate entries (key and value) instead of keys only
//   for (const [taskKey, task] of Object.entries(pongTasks)) {
//     fastify.route({
//       method: task.method,
//       url: task.url,
//       handler: async (req: any, reply: FastifyReply) => {
//         const result = await task.handler(req);
//         return reply.status(333).send({"hehe" : "Hihi"});
//       },
//     });
//   }
// }

// const port = parseInt(process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || '3000', 10);
// const host = process.env.PONG_BIND_TO || '0.0.0.0';

// fastify.listen({ port, host }, (err, address) => {
// 	if (err) {
// 		console.error(err);
// 		process.exit(1);
// 	}
// 	console.info(`Server listening at ${address}`);
// });
