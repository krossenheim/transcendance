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
import { truncate } from "fs";

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
    funcId: "/api/start_game",
    handler: singletonPong.startGame.bind(singletonPong),
  },
  MOVE_PADDLE: {
    funcId: "/api/move_paddle",
    handler: singletonPong.movePaddle.bind(singletonPong),
  },
};

// Setup WebSocket handler
setSocketOnMessageHandler(socketToHub, { tasks: pongTasks });

function truncDecimals(num: number, n: number = 6) {
  const factor = Math.pow(10, n);
  return Math.trunc(num * factor) / factor;
}

async function backgroundTask() {
  try {
    while (true) {
      if (socketToHub.readyState != socketToHub.OPEN) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      for (const [game_id, game] of singletonPong.pong_instances) {
        game.gameLoop();
        const recipients = Array.from(game.player_to_paddle.keys());
        const payload: { balls: any[]; paddles: any[] } = {
          balls: [],
          paddles: [],
        };

        for (const obj of game.pong_balls) {
          payload.balls.push({
            id: truncDecimals(obj.id),
            x: truncDecimals(obj.pos.x),
            y: truncDecimals(obj.pos.y),
            dx: truncDecimals(obj.dir.x),
            dy: truncDecimals(obj.dir.y),
            r: truncDecimals(obj.radius),
          });
        }

        for (const obj of game.player_paddles) {
          payload.paddles.push({
            x: truncDecimals(obj.pos.x),
            y: truncDecimals(obj.pos.y),
            r: truncDecimals(obj.r),
            w: truncDecimals(obj.width),
            l: truncDecimals(obj.length),
          });
        }
        const out = { recipients: recipients, funcId: 'pong_game', payload: payload };
        socketToHub.send(JSON.stringify(out));
      }
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
  } catch (err) {
    // TypeScript doesn’t know what `err` is, so check if it has `message`
    if (err instanceof Error) {
      console.error("Caught exception:", err.message);
    } else {
      console.error("Caught unknown exception:", err);
    }
    console.log(
      "INFINITE LOOP! CAN TOTALLY RECONNECT AND STUFF! HERE IT GOES."
    );
    while (true) {}
  }
}
backgroundTask();
