"use strict";
import Fastify from "fastify";
import PongManager from "./pongManager.js";
import websocketPlugin from "@fastify/websocket";
import { OurSocket } from "./utils/socket_to_hub.js";
import { int_url, user_url } from "./utils/api/service/common/endpoints.js";
import { Result } from "./utils/api/service/common/result.js";
import type { FastifyInstance } from "fastify";
import { createFastify } from "./utils/api/service/common/fastify.js";
import { registerRoute } from "./utils/api/service/common/fastify.js";
import PongGame from "./pongGame.js";
import { PongLobbyStatus } from "./playerPaddle.js";

const fastify: FastifyInstance = createFastify();

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
        const recipients = game.player_ids;

        const out = {
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
socket.registerReceiver(int_url.ws.hub.userDisconnected, async (wrapper) => {
  if (
    wrapper.code === int_url.ws.hub.userDisconnected.schema.output.Success.code
  ) {
    console.log("Wrapper is: ", JSON.stringify(wrapper));
    const userId = wrapper.payload.userId;
    if (!userId) throw new Error("Schema not validated.");
    singletonPong.setPlayerStatus(userId, PongLobbyStatus.Disconnected);
  } else
    return Result.Err(
      `Unhandled code(${
        wrapper.code
      }) for int_url.ws.hub.userDisconnected, wrapper: ${JSON.stringify(
        wrapper
      )}`
    );
  console.log("Returning ok, null");
  return Result.Ok(null);
});

console.log(singletonPong.startGame(7, [4, 5, 5], 1));

registerRoute(fastify, int_url.http.pong.startGame, async (request, reply) => {
  const { balls, player_list } = request.body;
  let result = PongGame.create(balls, player_list);

  if (result.isErr()) {
    return reply.status(500).send({ message: result.unwrapErr() });
  }
  return reply.status(200).send(result.unwrap().getGameState());
});

const port = parseInt(
  process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || "3000",
  10
);
const host = process.env.PONG_BIND_TO || "0.0.0.0";

fastify.listen({ port, host }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`Server listening at ${address}`);
});
