"use strict";
// import type { FastifyReply, FastifyInstance } from "fastify";
import {
  socketToHub,
//   setSocketOnMessageHandler,
} from "./utils/socket_to_hub.js";
import Fastify from "fastify";
import PongManager from "./pongManager.js";
import websocketPlugin from "@fastify/websocket";
import type {
  TypePongBall,
  TypePongPaddle,
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
  PLAYER_JOINED: {
    funcId: "/api/join_game",
    handler: singletonPong.playerJoinInstance.bind(singletonPong),
  },
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
// setSocketOnMessageHandler(socketToHub, { tasks: pongTasks });

async function backgroundTask() {
  try {
    while (true) {
      if (socketToHub.readyState != socketToHub.OPEN) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      for (const [game_id, game] of singletonPong.pong_instances) {
        game.gameLoop();
        const payload = game.getGameState();
        const recipients = Array.from(game.player_id_to_paddle.keys());

        const out = {
          recipients: recipients,
          funcId: "pong_game",
          payload: payload,
        };
        socketToHub.send(JSON.stringify(out));
      }
      const getNextFrameTime = 50; // game.next_frame_when?
      await new Promise((resolve) => setTimeout(resolve, getNextFrameTime));
    }
  } catch (err) {
    // TypeScript doesn’t know what `err` is, so check if it has `message`
    if (err instanceof Error) {
      console.error("Caught exception:", err.message);
    } else {
      console.error("Caught unknown exception:", err);
    }
    console.error(
      "INFINITE LOOP! CAN TOTALLY RECONNECT AND STUFF! HERE IT GOES."
    );
    while (true) {}
  }
}
backgroundTask();
// singletonPong.startGame({
//   user_id: 2,
//   funcId: "/api/start_game",
//   payload: { player_list: [2, 3, 4] },
// });
