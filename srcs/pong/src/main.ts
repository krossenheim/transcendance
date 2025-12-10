"use strict";
import type { TypeUserGameConfigSchema } from "@app/shared/api/service/pong/pong_interfaces";
import { PongGameOptions } from "./game/game.js";
import { PongManager } from "./pongManager.js";
import LobbyManager from "./lobbyManager.js";
import TournamentManager from "./tournamentManager.js";
import websocketPlugin from "@fastify/websocket";
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
import BlockchainService from "./services/blockchainService.js";

const fastify: FastifyInstance = createFastify();

fastify.register(websocketPlugin);

const socket = new OurSocket("pong");
const lobbyManager = new LobbyManager();
const singletonPong = new PongManager(socket);
const tournamentManager = new TournamentManager();
const blockchainService = new BlockchainService();

function createBasicGameOptions(userDefinedOptions: TypeUserGameConfigSchema): PongGameOptions {
  return {
    canvasWidth: 1000,
    canvasHeight: 1000,
    ballSpeed: userDefinedOptions.ballSpeed ?? 400,
    paddleSpeedFactor: userDefinedOptions.paddleSpeedFactor ?? 1.5,
    paddleWidthFactor: userDefinedOptions.paddleWidthFactor ?? 0.15,
    paddleHeight: 30,
    paddleWallOffset: 40,
    amountOfBalls: 1,
    powerupFrequency: userDefinedOptions.powerupFrequency ?? 2147483647,
    gameDuration: userDefinedOptions.gameDuration ?? 180,
  };
}

socket.registerHandler(user_url.ws.pong.handleGameKeys, async (body, response) => {
  singletonPong.handleUserInput(
    body.user_id,
    body.payload.pressed_keys,
  );
  return Result.Ok(response.select("MessageSent").reply({}));
});

socket.registerHandler(user_url.ws.pong.startGame, async (body, response) => {
  const player_list_requested = body.payload.player_list;
  const startGameResult = singletonPong.startGame(
    player_list_requested,
    createBasicGameOptions(body.payload.gameConfig ?? {})
  );

  if (startGameResult.isErr()) {
    return Result.Ok(response.select("FailedCreateGame").reply({
      message: "Failed to create game instance.",
    }));
  }

  const gameId = startGameResult.unwrap();
  return Result.Ok(response.select("GameInstanceCreated").replyTo(
    player_list_requested,
    {
      board_id: gameId,
      player_list: player_list_requested,
    }
  ));
});

socket.registerHandler(user_url.ws.pong.getGameState, async (body, response) => {
  const userId = body.user_id;
  const gameId = body.payload.gameId;
  const gameDataResult = singletonPong.getGameState(userId, gameId);
  if (gameDataResult.isErr()) {
    response.select("NotInRoom").reply({
      message: gameDataResult.unwrapErr(),
    });
  }

  const gameData = gameDataResult.unwrap();
  return Result.Ok(response.select("GameUpdate").reply(gameData));
});

// Lobby and Tournament handlers
socket.registerHandler(user_url.ws.pong.createLobby, async (body, response) => {
  const user_id = body.user_id;
  const { gameMode, playerIds, playerUsernames, gameConfig } = body.payload;

  console.log(`[Pong] ===== CREATE LOBBY HANDLER CALLED =====`);
  console.log(`[Pong] Creating lobby: host=${user_id}, mode=${gameMode}, players=${JSON.stringify(playerIds)}`);

  // Create the lobby
  const lobbyResult = lobbyManager.createLobby(
    gameMode,
    playerIds,
    playerUsernames || {},
    gameConfig ?? {},
  );

  if (lobbyResult.isErr()) {
    return Result.Ok(response.select("Failed").reply({
      message: lobbyResult.unwrapErr().message,
    }));
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
        gameConfig ?? {}
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
    gameConfig: lobby.gameConfig,
    status: lobby.status,
  };
  if (tournamentPayload) responsePayload.tournament = tournamentPayload;

  return Result.Ok(response.select("LobbyCreated").replyTo(playerIds, responsePayload));
});

socket.registerHandler(user_url.ws.pong.togglePlayerReady, async (body, response) => {
  const user_id = body.user_id;
  const { lobbyId } = body.payload;

  const toggleResult = lobbyManager.togglePlayerReady(lobbyId, user_id);

  if (toggleResult.isErr()) {
    response.select("NotInLobby").reply({
      message: toggleResult.unwrapErr().message,
    });
  }

  const lobby = toggleResult.unwrap();

  // Return lobby state to all players
  const playerIds = lobby.players.map((p) => p.userId);
  console.log(`[Pong] Toggled ready, returning lobby state to all players: ${JSON.stringify(playerIds)}`);

  return Result.Ok(response.select("LobbyUpdate").replyTo(
    playerIds,
    {
      lobbyId: lobby.lobbyId,
      gameMode: lobby.gameMode,
      players: lobby.players,
      gameConfig: lobby.gameConfig,
      status: lobby.status,
    }
  ));
});

socket.registerHandler(user_url.ws.pong.leaveLobby, async (body, response) => {
  const user_id = body.user_id;
  const { lobbyId } = body.payload;

  const lobby = lobbyManager.getLobby(lobbyId);
  if (!lobby) {
    return Result.Ok(response.select("NotInLobby").reply({
      message: "Lobby not found",
    }));
  }

  const removeResult = lobbyManager.removePlayerFromLobby(lobbyId, user_id);

  if (removeResult.isErr()) {
    return Result.Ok(response.select("NotInLobby").reply({
      message: removeResult.unwrapErr().message,
    }));
  }

  const updatedLobby = removeResult.unwrap();

  // If lobby was deleted (empty), just notify the leaving player
  if (updatedLobby === null) {
    console.log(`[Pong] Lobby ${lobbyId} deleted (empty)`);
    return Result.Ok(response.select("LeftLobby").reply({
      message: "Left lobby",
    }));
  }

  // Notify leaving player they left
  // const leftResponse = Result.Ok({
  //   recipients: [user_id],
  //   code: user_url.ws.pong.leaveLobby.schema.output.LeftLobby.code,
  //   payload: { message: "Left lobby" },
  // });

  return Result.Ok(response.select("LeftLobby").reply({
    message: "Left lobby",
  }));

  // Notify remaining players of updated lobby state
  // const remainingPlayerIds = updatedLobby.players.map((p) => p.userId);
  // console.log(`[Pong] Player ${user_id} left lobby ${lobbyId}, notifying remaining players: ${JSON.stringify(remainingPlayerIds)}`);

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
  // return leftResponse;
});

socket.registerHandler(user_url.ws.pong.startFromLobby, async (body, response) => {
  const user_id = body.user_id;
  const { lobbyId } = body.payload;

  const lobby = lobbyManager.getLobby(lobbyId);
  if (!lobby) {
    return Result.Ok(response.select("NotAllReady").reply({
      message: "Lobby not found",
    }));
  }

  // Check if user is host
  const hostPlayer = lobby.players.find((p) => p.isHost);
  if (!hostPlayer || hostPlayer.userId !== user_id) {
    return Result.Ok(response.select("NotHost").reply({
      message: "Only the host can start the game",
    }));
  }

  // Check if all players are ready
  if (!lobbyManager.canStartGame(lobbyId)) {
    return Result.Ok(response.select("NotAllReady").reply({
      message: "Not all players are ready",
    }));
  }

  // Create the actual pong game
  const playerIds = lobby.players.map((p) => p.userId);
  const gameResult = singletonPong.startGame(playerIds, createBasicGameOptions(lobby.gameConfig ?? {}));

  if (gameResult.isErr()) {
    return Result.Ok(response.select("NotAllReady").reply({
      message: "Failed to start game",
    }));
  }

  // Get the game_id from the startGame response
  const gameId = gameResult.unwrap();

  // Mark lobby as in progress
  lobbyManager.startGame(lobbyId, user_id, gameId);

  // Get game state directly
  const gameState = singletonPong.getGameState(user_id, gameId);
  if (gameState.isErr()) {
    return Result.Ok(response.select("NotAllReady").reply({
      message: "Failed to retrieve game state",
    }));
  }

  // Clean up lobby now that game has started
  console.log(`[Pong] Game ${gameId} started from lobby ${lobbyId}, removing lobby`);
  lobbyManager.removeLobby(lobbyId);

  return Result.Ok({
    recipients: playerIds,
    code: user_url.ws.pong.startFromLobby.schema.output.GameStarted.code,
    payload: gameState.unwrap(),
  });
});

socket.registerReceiver(int_url.ws.hub.userDisconnected, async (wrapper) => {
  if (wrapper.code !== int_url.ws.hub.userDisconnected.schema.output.Success.code)
    return Result.Ok(null);

  const userId = wrapper.payload.userId;
  singletonPong.handleUserDisconnect(userId);
  return Result.Ok(null);
});

// registerRoute(fastify, int_url.http.pong.createGame, async (request, reply) => {
//   const { balls, player_list } = request.body;
//   let result = PongGame.create(balls, player_list);

//   if (result.isErr()) {
//     return reply.status(500).send({ message: result.unwrapErr() });
//   }
//   return reply.status(200).send(result.unwrap().getGameState());
// });

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
fastify.get('/public_api/pong/tournaments/:id/stats', async (request, reply) => {
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
