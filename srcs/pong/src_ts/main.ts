"use strict";
// import type { FastifyReply, FastifyInstance } from "fastify";
import Fastify from "fastify";
import PongManager from "./pongManager.js";
import websocketPlugin from "@fastify/websocket";
import type {
  TypeMovePaddlePayloadScheme,
  TypePongBall,
  TypePongPaddle,
} from "./utils/api/service/pong/pong_interfaces.js";
import { OurSocket } from "./utils/socket_to_hub.js";

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
const socket = new OurSocket("pong");

// Setup WebSocket handler
// setSocketOnMessageHandler(socketToHub, { tasks: pongTasks });
import { user_url } from "./utils/api/service/common/endpoints.js";
import type {
  T_ForwardToContainer,
  T_PayloadToUsers,
  TypePayloadHubToUsersSchema,
} from "./utils/api/service/hub/hub_interfaces.js";

async function backgroundTask() {
  let loops = 0;
  try {
    while (true) {
      if (socket.getSocket().readyState != socket.getSocket().OPEN) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      for (const [game_id, game] of singletonPong.pong_instances) {
        game.gameLoop();
        const payload = game.getGameState();
        const recipients = Array.from(game.player_id_to_paddle.keys());

        const out: T_PayloadToUsers = {
          recipients: recipients,
          funcId: user_url.ws.pong.getGameState.funcId,
          code: 666,
          payload: payload,
        };
        socket.getSocket().send(JSON.stringify(out));
      }
      const getNextFrameTime = 35; // game.next_frame_when?
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

// socket.registerEvent(
//   user_url.ws.pong.movePaddle,
//   async (body: TypeMovePaddlePayloadScheme, wrapper: T_ForwardToContainer) => {
//     return singletonPong.movePaddle(body, wrapper);
//   }
// );

socket.registerEvent(
  user_url.ws.pong.startGame,
  async (wrapper) => {
    return singletonPong.startGame(wrapper);
  }
);

console.log(
  singletonPong.startGame({
    user_id: 7,
    funcId: "/api/start_game",
    payload: { balls: 20, player_list: [4, 5, 6, 7, 8] },
  })
);
