"use strict";
import PongManager from "./pongManager.js";
import LobbyManager from "./lobbyManager.js";
import TournamentManager from "./tournamentManager.js";
import websocketPlugin from "@fastify/websocket";
import WebSocket from "ws";
import { OurSocket } from "@app/shared/socket_to_hub";
import { int_url, user_url } from "@app/shared/api/service/common/endpoints";
import { Result } from "@app/shared/api/service/common/result";
import type { FastifyInstance } from "fastify";
import { createFastify } from "@app/shared/api/service/common/fastify";
// Prometheus metrics
import client from "prom-client";

// Collect default Node.js metrics
client.collectDefaultMetrics({ prefix: 'pong_' });

// Expose metrics on /metrics
import { registerRoute } from "@app/shared/api/service/common/fastify";
import PongGame from "./pongGame.js";
import { PongLobbyStatus } from "./playerPaddle.js";
import BlockchainService from "./services/blockchainService.js";

const fastify: FastifyInstance = createFastify();

fastify.register(websocketPlugin);

const singletonPong = new PongManager();
const lobbyManager = new LobbyManager();
const tournamentManager = new TournamentManager();
const socket = new OurSocket("pong");
const blockchainService = new BlockchainService();

async function backgroundTask() {
  try {
    while (true) {
      // Use the ws library OPEN constant to reliably compare readyState
      if (socket.getSocket().readyState !== WebSocket.OPEN) {
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
        if (!game.paused && game_id) socket.getSocket().send(JSON.stringify(out));
      }
      const getNextFrameTime = 17; // game.next_frame_when?
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

//handle input to a function funcId
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
socket.registerHandler(user_url.ws.pong.getGameState, async (wrapper) => {
  const user_id = wrapper.user_id;
  const game_id_optional = wrapper.payload.gameId;
  // If no game_id provided, get first active game for the user
  const game_id = game_id_optional ?? singletonPong.getFirstGameIdForPlayer(user_id);
  if (!game_id) {
    return Result.Ok({
      recipients: [user_id],
      code: user_url.ws.pong.getGameState.schema.output.NotInRoom.code,
      payload: {
        message: "User is not in any active game.",
      },
    });
  }
  return singletonPong.getGameState(user_id, game_id);
});

// Lobby and Tournament handlers
socket.registerHandler(user_url.ws.pong.createLobby, async (wrapper) => {
  const user_id = wrapper.user_id;
  const { gameMode, playerIds, playerUsernames, ballCount, maxScore, allowPowerups } = wrapper.payload;
  
  console.log(`[Pong] ===== CREATE LOBBY HANDLER CALLED =====`);
  console.log(`[Pong] Creating lobby: host=${user_id}, mode=${gameMode}, players=${JSON.stringify(playerIds)}`);
  
  // Create the lobby
  const lobbyResult = lobbyManager.createLobby(
    gameMode,
    playerIds,
    playerUsernames || {},
    ballCount,
    maxScore,
    allowPowerups || false
  );
  
  if (lobbyResult.isErr()) {
    return Result.Ok({
      recipients: [user_id],
      code: user_url.ws.pong.createLobby.schema.output.Failed.code,
      payload: { message: lobbyResult.unwrapErr().message },
    });
  }
  
  const lobby = lobbyResult.unwrap();
  
  console.log(`[Pong] Created lobby, returning to ALL players including invitees: ${JSON.stringify(playerIds)}`);
  // If this lobby is a tournament, create a Tournament on the server-side
  // and attach it to the lobby so invitees receive tournament context.
  let tournamentPayload = undefined;
  if (gameMode === "tournament_1v1" || gameMode === "tournament_multi") {
    try {
      const tournamentName = `${gameMode === "tournament_1v1" ? "1v1" : "Multiplayer"} Tournament`;
      const tResult = tournamentManager.createTournament(
        tournamentName,
        gameMode,
        playerIds,
        ballCount,
        maxScore
      );
      if (!tResult.isErr()) {
        const tournament = tResult.unwrap();
        // Record the tournamentId on the lobby so it can be looked up later
        lobbyManager.setTournamentId(lobby.lobbyId, tournament.tournamentId);
        tournamentPayload = tournament;
        console.log(`[Pong] Created tournament ${tournament.tournamentId} for lobby ${lobby.lobbyId}`);
      } else {
        console.error("Failed to create tournament for lobby:", tResult.unwrapErr());
      }
    } catch (e) {
      console.error("Error while creating tournament for lobby:", e);
    }
  }
  
  // Return lobby state to ALL players (host + invited)
  // This will be sent by the hub to all recipients
  // Build payload, include tournament data when present
  const responsePayload: any = {
    lobbyId: lobby.lobbyId,
    gameMode: lobby.gameMode,
    players: lobby.players,
    ballCount: lobby.ballCount,
    maxScore: lobby.maxScore,
    allowPowerups: lobby.allowPowerups,
    status: lobby.status,
  };
  if (tournamentPayload) responsePayload.tournament = tournamentPayload;

  return Result.Ok({
    recipients: playerIds, // Send to ALL players, not just host
    code: user_url.ws.pong.createLobby.schema.output.LobbyCreated.code,
    payload: responsePayload,
  });
});

socket.registerHandler(user_url.ws.pong.togglePlayerReady, async (wrapper) => {
  const user_id = wrapper.user_id;
  const { lobbyId } = wrapper.payload;
  
  const toggleResult = lobbyManager.togglePlayerReady(lobbyId, user_id);
  
  if (toggleResult.isErr()) {
    return Result.Ok({
      recipients: [user_id],
      code: user_url.ws.pong.togglePlayerReady.schema.output.NotInLobby.code,
      payload: { message: toggleResult.unwrapErr().message },
    });
  }
  
  const lobby = toggleResult.unwrap();
  
  // Return lobby state to all players
  const playerIds = lobby.players.map((p) => p.userId);
  console.log(`[Pong] Toggled ready, returning lobby state to all players: ${JSON.stringify(playerIds)}`);
  
  return Result.Ok({
    recipients: playerIds,  // Send to all players in lobby
    code: user_url.ws.pong.togglePlayerReady.schema.output.LobbyUpdate.code,
    payload: {
      lobbyId: lobby.lobbyId,
      gameMode: lobby.gameMode,
      players: lobby.players,
      ballCount: lobby.ballCount,
      maxScore: lobby.maxScore,
      allowPowerups: lobby.allowPowerups,
      status: lobby.status,
    },
  });
});

socket.registerHandler(user_url.ws.pong.leaveLobby, async (wrapper) => {
  const user_id = wrapper.user_id;
  const { lobbyId } = wrapper.payload;
  
  const lobby = lobbyManager.getLobby(lobbyId);
  if (!lobby) {
    return Result.Ok({
      recipients: [user_id],
      code: user_url.ws.pong.leaveLobby.schema.output.NotInLobby.code,
      payload: { message: "Lobby not found" },
    });
  }
  
  const removeResult = lobbyManager.removePlayerFromLobby(lobbyId, user_id);
  
  if (removeResult.isErr()) {
    return Result.Ok({
      recipients: [user_id],
      code: user_url.ws.pong.leaveLobby.schema.output.NotInLobby.code,
      payload: { message: removeResult.unwrapErr().message },
    });
  }
  
  const updatedLobby = removeResult.unwrap();
  
  // If lobby was deleted (empty), just notify the leaving player
  if (updatedLobby === null) {
    console.log(`[Pong] Lobby ${lobbyId} deleted (empty)`);
    return Result.Ok({
      recipients: [user_id],
      code: user_url.ws.pong.leaveLobby.schema.output.LeftLobby.code,
      payload: { message: "Left lobby" },
    });
  }
  
  // Notify leaving player they left
  const leftResponse = Result.Ok({
    recipients: [user_id],
    code: user_url.ws.pong.leaveLobby.schema.output.LeftLobby.code,
    payload: { message: "Left lobby" },
  });
  
  // Notify remaining players of updated lobby state
  const remainingPlayerIds = updatedLobby.players.map((p) => p.userId);
  console.log(`[Pong] Player ${user_id} left lobby ${lobbyId}, notifying remaining players: ${JSON.stringify(remainingPlayerIds)}`);
  
  // Send update to remaining players
  // const updateResponse = Result.Ok({
  //   recipients: remainingPlayerIds,
  //   code: user_url.ws.pong.leaveLobby.schema.output.LobbyUpdate.code,
  //   payload: {
  //     lobbyId: updatedLobby.lobbyId,
  //     gameMode: updatedLobby.gameMode,
  //     players: updatedLobby.players,
  //     ballCount: updatedLobby.ballCount,
  //     maxScore: updatedLobby.maxScore,
  //     allowPowerups: updatedLobby.allowPowerups,
  //     status: updatedLobby.status,
  //   },
  // });
  
  // TODO: Send both responses - for now, just return the left response
  // The hub needs to support multiple responses or we need to call send manually
  return leftResponse;
});

socket.registerHandler(user_url.ws.pong.startFromLobby, async (wrapper) => {
  const user_id = wrapper.user_id;
  const { lobbyId } = wrapper.payload;
  
  const lobby = lobbyManager.getLobby(lobbyId);
  if (!lobby) {
    return Result.Ok({
      recipients: [user_id],
      code: user_url.ws.pong.startFromLobby.schema.output.NotAllReady.code,
      payload: { message: "Lobby not found" },
    });
  }
  
  // Check if user is host
  const hostPlayer = lobby.players.find((p) => p.isHost);
  if (!hostPlayer || hostPlayer.userId !== user_id) {
    return Result.Ok({
      recipients: [user_id],
      code: user_url.ws.pong.startFromLobby.schema.output.NotHost.code,
      payload: { message: "Only the host can start the game" },
    });
  }
  
  // Check if all players are ready
  if (!lobbyManager.canStartGame(lobbyId)) {
    return Result.Ok({
      recipients: [user_id],
      code: user_url.ws.pong.startFromLobby.schema.output.NotAllReady.code,
      payload: { message: "Not all players are ready" },
    });
  }
  
  // Create the actual pong game
  const playerIds = lobby.players.map((p) => p.userId);
  const gameResult = singletonPong.startGame(user_id, playerIds, lobby.ballCount);
  
  if (gameResult.isErr()) {
    return Result.Ok({
      recipients: [user_id],
      code: user_url.ws.pong.startFromLobby.schema.output.NotAllReady.code,
      payload: { message: "Failed to start game" },
    });
  }
  
  // Get the game_id from the startGame response
  const startResult = gameResult.unwrap();
  
  if (!startResult || !startResult.payload) {
    return Result.Ok({
      recipients: [user_id],
      code: user_url.ws.pong.startFromLobby.schema.output.NotAllReady.code,
      payload: { message: "Failed to get game data" },
    });
  }
  
  const startPayload = startResult.payload;
  let game_id: number;
  
  if ('board_id' in startPayload) {
    game_id = startPayload.board_id;
  } else {
    return Result.Ok({
      recipients: [user_id],
      code: user_url.ws.pong.startFromLobby.schema.output.NotAllReady.code,
      payload: { message: "Failed to get game board ID" },
    });
  }
  
  // Mark lobby as in progress
  lobbyManager.startGame(lobbyId, user_id, game_id);
  
  // Get game instance to get state
  const game = singletonPong.pong_instances.get(game_id);
  if (!game) {
    return Result.Ok({
      recipients: [user_id],
      code: user_url.ws.pong.startFromLobby.schema.output.NotAllReady.code,
      payload: { message: "Game not found after creation" },
    });
  }
  
  // Set all paddles to Ready status since we're starting from a lobby
  // where all players have already confirmed ready
  for (const paddle of game.player_paddles) {
    paddle.connectionStatus = PongLobbyStatus.Ready;
  }
  
  // Get game state directly
  const gameState = game.getGameState();
  
  // Clean up lobby now that game has started
  console.log(`[Pong] Game ${game_id} started from lobby ${lobbyId}, removing lobby`);
  lobbyManager.removeLobby(lobbyId);
  
  return Result.Ok({
    recipients: playerIds,
    code: user_url.ws.pong.startFromLobby.schema.output.GameStarted.code,
    payload: gameState,
  });
});

// Handle output from a function funcId
socket.registerReceiver(int_url.ws.hub.userDisconnected, async (wrapper) => {
  if (
    wrapper.code === int_url.ws.hub.userDisconnected.schema.output.Success.code
  ) {
    console.log("Wrapper is: ", JSON.stringify(wrapper));
    const userId = wrapper.payload.userId;
    if (!userId) throw new Error("Schema not validated.");
    singletonPong.setPlayerStatus(userId, PongLobbyStatus.Disconnected);
    
    // Remove player from any lobby they're in
    const playerLobby = lobbyManager.getLobbyForPlayer(userId);
    if (playerLobby) {
      console.log(`[Pong] User ${userId} disconnected, removing from lobby ${playerLobby.lobbyId}`);
      lobbyManager.removePlayerFromLobby(playerLobby.lobbyId, userId);
    }
  } else
    return Result.Err(
      `Unhandled code(${
        wrapper.code
      }) for int_url.ws.hub.userDisconnected, wrapper: ${JSON.stringify(
        wrapper
      )}`
    );
  return Result.Ok(null);
});
socket.registerReceiver(int_url.ws.hub.userConnected, async (wrapper) => {
  if (
    wrapper.code === int_url.ws.hub.userConnected.schema.output.Success.code
  ) {
    console.log("Wrapper is: ", JSON.stringify(wrapper));
    const userId = wrapper.payload.userId;
    if (!userId) {
      console.error("INVALID SCHEMA");
      throw new Error("Schema not validated.");
    }
    singletonPong.setPlayerStatus(userId, PongLobbyStatus.Paused);
    // find any games the user is on and send a getGameState from each
    const ongoing_user_games = singletonPong.getGamesWithPlayerById(userId);
    if (!ongoing_user_games) {
      // console.log("No ongoing games for user ", userId);
      return Result.Ok(null);
    }
    for (const game of ongoing_user_games) {
      const payload = game.getGameState();
      const recipients = game.player_ids;

      const out = {
        recipients: recipients,
        funcId: user_url.ws.pong.getGameState.funcId,
        code: user_url.ws.pong.getGameState.schema.output.GameUpdate.code,
        payload: payload,
      };
      // console.log("Sending out: ", JSON.stringify(out));
      socket.getSocket().send(JSON.stringify(out));
    }
  } else
    return Result.Err(
      `Unhandled code(${
        wrapper.code
      }) for int_url.ws.hub.userConnected, wrapper: ${JSON.stringify(wrapper)}`
    );

  return Result.Ok(null);
});
console.log(singletonPong.startGame(7, [4, 5, 5], 1));

registerRoute(fastify, int_url.http.pong.createGame, async (request, reply) => {
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

// register a /metrics route for Prometheus to scrape
fastify.get('/metrics', async (request, reply) => {
  try {
    reply.header('Content-Type', client.register.contentType);
    const metrics = await client.register.metrics();
    return reply.send(metrics);
  } catch (err) {
    reply.status(500).send('Could not collect metrics');
  }
});

// Public API: Get tournament stats including on-chain tx hashes
fastify.get('/api/pong/tournaments/:id/stats', async (request, reply) => {
  const idParam = (request.params as any).id;
  const tid = Number(idParam);
  if (Number.isNaN(tid)) return reply.status(400).send({ message: 'invalid tournament id' });

  const tournament = tournamentManager.getTournament(tid);
  if (!tournament) return reply.status(404).send({ message: 'tournament not found' });

  // Return tournament data; onchainTxHashes (if any) will be included
  return reply.status(200).send({ tournament });
});

// Internal endpoint to record a tournament score on-chain.
// Protect with INTERNAL_API_SECRET header for simple access control in dev.
fastify.post('/api/pong/blockchain/record_score', async (request, reply) => {
  const body: any = request.body as any;
  const secret = (request.headers['x-internal-secret'] as string) || undefined;
  if (process.env.INTERNAL_API_SECRET && secret !== process.env.INTERNAL_API_SECRET) {
    return reply.status(403).send({ message: 'forbidden' });
  }

  if (!blockchainService.isConfigured()) {
    return reply.status(500).send({ message: 'blockchain service not configured (set CONTRACT_ADDRESS and DEPLOYER_PRIVATE_KEY)' });
  }

  const tournamentId = Number(body.tournamentId);
  const playerAddress = body.playerAddress as string | undefined;
  const score = Number(body.score);

  if (Number.isNaN(tournamentId) || Number.isNaN(score)) {
    return reply.status(400).send({ message: 'invalid payload' });
  }

  try {
    const txHash = await blockchainService.recordScore(tournamentId, playerAddress, score);
    return reply.status(200).send({ txHash });
  } catch (err: any) {
    return reply.status(500).send({ message: err?.message || String(err) });
  }
});

fastify.listen({ port, host }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`Server listening at ${address}`);
});
