"use strict";
import Fastify from "fastify";
import PongManager from "./pongManager.js";
import websocketPlugin from "@fastify/websocket";
import { OurSocket } from "./utils/socket_to_hub.js";
import { user_url } from "./utils/api/service/common/endpoints.js";
import type { T_PayloadToUsers } from "./utils/api/service/hub/hub_interfaces.js";

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
          code: user_url.ws.pong.getGameState.schema.output.GameUpdate.code,
          payload: payload,
        };
        if (!game.paused) socket.getSocket().send(JSON.stringify(out));
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

socket.registerHandler(user_url.ws.pong.movePaddle, async (wrapper) => {
  const game_id = wrapper.payload.board_id;
  const paddle_id = wrapper.payload.paddle_id;
  const user_id = wrapper.user_id;
  const to_right = wrapper.payload.m;
  return singletonPong.movePaddle(game_id, paddle_id, user_id, to_right);
});
socket.registerHandler(user_url.ws.pong.startGame, async (wrapper) => {
  const user_id = wrapper.user_id;
  const player_list_requested = wrapper.payload.player_list;
  const ball_count_requested = wrapper.payload.balls;
  return singletonPong.startGame(
    user_id,
    player_list_requested,
    ball_count_requested
  );
});
socket.registerHandler(user_url.ws.pong.userReportsReady, async (wrapper) => {
  const user_id = wrapper.user_id;
  const game_id = wrapper.payload.game_id;
  return singletonPong.userReportsReady(user_id, game_id);
});

console.log(singletonPong.startGame(7, [4, 5, 5], 1));
