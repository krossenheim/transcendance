"use strict";
import { PongGameOptions } from "./game/game.js";
import { PongManager } from "./pongManager.js";
import { AIDifficulty } from "./aiController.js";
import LobbyManager from "./lobbyManager.js";
import TournamentManager from "./tournamentManager.js";
import websocketPlugin from "@fastify/websocket";
import { OurSocket } from "@app/shared/socket_to_hub";
import { int_url, user_url } from "@app/shared/api/service/common/endpoints";
import { Result } from "@app/shared/api/service/common/result";
import { createFastify } from "@app/shared/api/service/common/fastify";
// Prometheus metrics
import client from "prom-client";

// Collect default Node.js metrics
client.collectDefaultMetrics({ prefix: 'pong_' });

// Expose metrics on /metrics
import BlockchainService from "./services/blockchainService.js";

// Cast to any to avoid FastifyInstance type mismatch with websocket plugin
const fastify: any = createFastify();

fastify.register(websocketPlugin);

const socket = new OurSocket("pong");
const lobbyManager = new LobbyManager();
const singletonPong = new PongManager(socket);
const tournamentManager = new TournamentManager();
const blockchainService = new BlockchainService();

// AI player constants (shared across handlers)
const AI_PLAYER_ID_BASE = -1001; // AI players use IDs -1001, -1002, ...
function isAiPlayer(userId: number): boolean {
  return userId <= AI_PLAYER_ID_BASE;
}

// Local tournament player constants
const LOCAL_PLAYER_ID_BASE = -500; // Local players use IDs -500, -501, ...
function isLocalPlayer(userId: number): boolean {
  return userId <= LOCAL_PLAYER_ID_BASE && userId > -999;
}

/** Filter out AI player IDs from an array (AI can't receive WebSocket messages) */
function filterHumanIds(ids: number[]): number[] {
  return ids.filter(id => !isAiPlayer(id) && !isLocalPlayer(id));
}

// Connect tournament manager to pong manager for match completion
singletonPong.setTournamentMatchEndCallback(async (tournamentId, matchId, winnerId) => {
  console.log(`[Pong] Recording tournament match winner: tournament=${tournamentId}, match=${matchId}, winner=${winnerId}`);
  const result = await tournamentManager.recordMatchWinner(tournamentId, matchId, winnerId);
  if (result.isErr()) {
    console.error("Failed to record match winner:", result.unwrapErr());
    return;
  }
  
  const tournament = result.unwrap();
  console.log(`[Pong] Tournament match recorded. Status: ${tournament.status}, Winner: ${tournament.winnerId}`);
  if (tournament.onchainTxHashes && tournament.onchainTxHashes.length > 0) {
    console.log(`[Pong] On-chain tx hashes: ${tournament.onchainTxHashes.join(", ")}`);
  }

  // Find the completed match to get the loser
  const completedMatch = tournament.matches.find(m => m.matchId === matchId);
  if (!completedMatch) {
    console.error(`[Pong] Could not find match ${matchId} in tournament ${tournamentId}`);
    return;
  }
  
  const loserId = completedMatch.player1Id === winnerId ? completedMatch.player2Id : completedMatch.player1Id;
  if (loserId === null) {
    console.error(`[Pong] Could not determine loser for match ${matchId}`);
    return;
  }

  // Build tournament data for the schema
  const tournamentData = {
    tournamentId: tournament.tournamentId,
    name: tournament.name,
    mode: tournament.mode,
    players: tournament.players,
    matches: tournament.matches,
    currentRound: tournament.currentRound,
    totalRounds: tournament.totalRounds,
    status: tournament.status,
    winnerId: tournament.winnerId,
    ballCount: tournament.ballCount,
    maxScore: tournament.maxScore,
    onchainTxHashes: tournament.onchainTxHashes || [],
    isLocal: tournament.isLocal,
    hostUserId: tournament.hostUserId,
  };

  const isTournamentComplete = tournament.status === "completed";

  // For local tournaments, send all updates to the host
  if (tournament.isLocal && tournament.hostUserId) {
    const hostId = tournament.hostUserId;
    const nextMatch = tournamentManager.getNextPendingMatchForPlayer(tournamentId, hostId);
    // Also find next ready match for the bracket
    const readyMatches = tournamentManager.getAllReadyMatches(tournamentId);
    const nextReadyMatch = readyMatches.length > 0 ? readyMatches[0] : null;

    const payload = {
      tournamentId,
      matchId,
      winnerId,
      loserId,
      tournament: tournamentData,
      nextMatch: nextReadyMatch || nextMatch,
      isTournamentComplete,
    };

    console.log(`[Pong] Sending local tournament match result to host ${hostId}`);
    socket.sendMessage(user_url.ws.pong.tournamentMatchResult, {
      recipients: [hostId],
      code: user_url.ws.pong.tournamentMatchResult.schema.output.MatchResult.code,
      payload,
    });

    // Auto-start AI vs AI matches
    await autoStartAiVsAiMatches(tournamentId);
    return;
  }

  // Players in this match (will get full match result) — only humans
  const matchPlayerIds = filterHumanIds(
    [completedMatch.player1Id, completedMatch.player2Id].filter(id => id !== null) as number[]
  );
  
  // All human tournament players
  const allPlayerIds = filterHumanIds(tournament.players.map(p => p.userId));
  
  // Send match result to players who were IN the match
  for (const playerId of matchPlayerIds) {
    const nextMatch = tournamentManager.getNextPendingMatchForPlayer(tournamentId, playerId);
    
    const payload = {
      tournamentId,
      matchId,
      winnerId,
      loserId,
      tournament: tournamentData,
      nextMatch: nextMatch,
      isTournamentComplete,
    };

    console.log(`[Pong] Sending match result to participant ${playerId}: winner=${winnerId}, loser=${loserId}, nextMatch=${nextMatch?.matchId || 'none'}`);
    
    socket.sendMessage(user_url.ws.pong.tournamentMatchResult, {
      recipients: [playerId],
      code: user_url.ws.pong.tournamentMatchResult.schema.output.MatchResult.code,
      payload,
    });
  }

  // Send tournament state update to OTHER players (not in this match)
  // Use winnerId=-1 to indicate this is just a state update, not their match result
  const otherPlayerIds = allPlayerIds.filter(id => !matchPlayerIds.includes(id));
  for (const playerId of otherPlayerIds) {
    const nextMatch = tournamentManager.getNextPendingMatchForPlayer(tournamentId, playerId);
    
    const payload = {
      tournamentId,
      matchId,
      winnerId: null, // null indicates "not your match"
      loserId: null,
      tournament: tournamentData,
      nextMatch: nextMatch,
      isTournamentComplete,
    };

    console.log(`[Pong] Sending tournament update to non-participant ${playerId}: nextMatch=${nextMatch?.matchId || 'none'}`);
    
    socket.sendMessage(user_url.ws.pong.tournamentMatchResult, {
      recipients: [playerId],
      code: user_url.ws.pong.tournamentMatchResult.schema.output.MatchResult.code,
      payload,
    });
  }

  // Don't auto-start remaining matches - let players use "Join Match" in bracket view
  // This ensures both players are ready before starting

  // Auto-start any AI vs AI matches that became ready after this match ended
  await autoStartAiVsAiMatches(tournamentId);
});

/**
 * Auto-start all tournament matches where both players are AI.
 * Called after bracket generation and after any match completes (winner advances).
 */
async function autoStartAiVsAiMatches(tournamentId: number): Promise<void> {
  const tournament = tournamentManager.getTournament(tournamentId);
  if (!tournament || tournament.status === "completed") return;

  const readyMatches = tournamentManager.getAllReadyMatches(tournamentId);
  for (const match of readyMatches) {
    if (match.player1Id === null || match.player2Id === null) continue;
    if (!isAiPlayer(match.player1Id) || !isAiPlayer(match.player2Id)) continue;

    // Both players are AI — auto-start this match
    const matchPlayerIds = [match.player1Id, match.player2Id];
    console.log(`[Pong] Auto-starting AI vs AI match ${match.matchId}: ${matchPlayerIds.join(' vs ')}`);

    const playerUsernames: { [key: number]: string } = {};
    for (const p of tournament.players) {
      playerUsernames[p.userId] = p.alias || p.username;
    }

    const gameResult = singletonPong.startGame(
      matchPlayerIds,
      createGameOptionsFromLobby(tournament.ballCount, false, tournament.maxScore),
      tournamentId,
      match.matchId,
      matchPlayerIds, // both are AI
      playerUsernames
    );

    if (gameResult.isErr()) {
      console.error(`[Pong] Failed to auto-start AI vs AI match ${match.matchId}`);
      continue;
    }

    const gameId = gameResult.unwrap();
    tournamentManager.startTournamentMatch(tournamentId, match.matchId, match.player1Id, gameId);
    console.log(`[Pong] AI vs AI match ${match.matchId} started (game ${gameId})`);

    // Notify all human tournament participants of the tournament state update
    const humanPlayerIds = filterHumanIds(tournament.players.map(p => p.userId));
    const tournamentData = {
      tournamentId: tournament.tournamentId,
      name: tournament.name,
      mode: tournament.mode,
      players: tournament.players,
      matches: tournament.matches,
      currentRound: tournament.currentRound,
      totalRounds: tournament.totalRounds,
      status: tournament.status,
      winnerId: tournament.winnerId,
      ballCount: tournament.ballCount,
      maxScore: tournament.maxScore,
      onchainTxHashes: tournament.onchainTxHashes || [],
    };

    for (const playerId of humanPlayerIds) {
      const nextMatch = tournamentManager.getNextPendingMatchForPlayer(tournamentId, playerId);
      socket.sendMessage(user_url.ws.pong.tournamentMatchResult, {
        recipients: [playerId],
        code: user_url.ws.pong.tournamentMatchResult.schema.output.MatchResult.code,
        payload: {
          tournamentId,
          matchId: match.matchId,
          winnerId: null,
          loserId: null,
          tournament: tournamentData,
          nextMatch: nextMatch,
          isTournamentComplete: false,
        },
      });
    }
  }
}

function createGameOptionsFromLobby(ballCount: number, allowPowerups: boolean, maxScore?: number, gameMode?: string): PongGameOptions {
  console.log(`[Pong] createGameOptionsFromLobby called: ballCount=${ballCount}, allowPowerups=${allowPowerups}, maxScore=${maxScore}, gameMode=${gameMode}`);
  // lastOneStanding games run until 1 player remains, so use a very long duration
  const effectiveDuration = gameMode === 'lastOneStanding' ? 999999 : 180;
  const options: PongGameOptions = {
    canvasWidth: 1000,
    canvasHeight: 1000,
    ballSpeed: 450,
    paddleSpeedFactor: 4.0,
    paddleWidthFactor: 0.15,
    paddleHeight: 30,
    paddleWallOffset: 40,
    amountOfBalls: ballCount,
    // If powerups disabled, set frequency to very high number (effectively never spawns)
    powerupFrequency: allowPowerups ? 10 : 999999,
    gameDuration: effectiveDuration,
    ...(gameMode ? { gameMode } : {}),
  };
  if (maxScore !== undefined) {
    options.maxScore = maxScore;
  }
  console.log(`[Pong] Game options: powerupFrequency=${options.powerupFrequency}, maxScore=${options.maxScore}, gameMode=${options.gameMode}`);
  return options;
}

socket.registerHandler(user_url.ws.pong.handleGameKeys, async (body, response) => {
  singletonPong.handleUserInput(
    body.userId,
    body.payload.pressed_keys,
    body.payload.clientTimestamp,  // Pass client timestamp for lag compensation
  );
  return Result.Ok(response.select("MessageSent").reply({}));
});

socket.registerHandler(user_url.ws.pong.startGame, async (body, response) => {
  const player_list_requested = body.payload.player_list;
  const allowPowerups = body.payload.allowPowerups ?? false;
  const gameOptions = createGameOptionsFromLobby(body.payload.balls || 1, allowPowerups);
  const startGameResult = singletonPong.startGame(
    player_list_requested,
    gameOptions
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
  const userId = body.userId;
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
  const user_id = body.userId;
  const { gameMode, playerIds, playerUsernames, ballCount, maxScore, allowPowerups, aiCount, aiDifficulty, localPlayerNames } = body.payload;

  console.log(`[Pong] ===== CREATE LOBBY HANDLER CALLED =====`);
  console.log(`[Pong] Creating lobby: host=${user_id}, mode=${gameMode}, players=${JSON.stringify(playerIds)}, aiCount=${aiCount || 0}, localPlayerNames=${JSON.stringify(localPlayerNames)}`);

  // For local tournaments: generate virtual player IDs for local players
  const isLocalTournament = gameMode === "tournament" && localPlayerNames && localPlayerNames.length > 0;
  let effectivePlayerIds = [...playerIds];
  let effectivePlayerUsernames = { ...(playerUsernames || {}) };

  if (isLocalTournament) {
    // Host is already in playerIds. Add local players with virtual IDs.
    for (let i = 0; i < localPlayerNames.length; i++) {
      const localId = LOCAL_PLAYER_ID_BASE - i;
      effectivePlayerIds.push(localId);
      effectivePlayerUsernames[String(localId)] = localPlayerNames[i]!;
    }
    console.log(`[Pong] Local tournament: generated ${localPlayerNames.length} local player IDs`);
  }

  // Create the lobby
  const lobbyResult = lobbyManager.createLobby(
    gameMode,
    effectivePlayerIds,
    effectivePlayerUsernames,
    ballCount,
    maxScore,
    allowPowerups || false,
    aiCount || 0,
    aiDifficulty || 3
  );

  if (lobbyResult.isErr()) {
    return Result.Ok(response.select("Failed").reply({
      message: lobbyResult.unwrapErr().message,
    }));
  }

  const lobby = lobbyResult.unwrap();

  // For local tournaments, auto-ready all virtual local players (they can't toggle ready themselves)
  if (isLocalTournament) {
    for (const player of lobby.players) {
      if (isLocalPlayer(player.userId)) {
        player.isReady = true;
      }
    }
  }

  console.log(`[Pong] Created lobby, returning to ALL players including invitees: ${JSON.stringify(effectivePlayerIds)}`);
  // If this lobby is a tournament, create a Tournament on the server-side
  // and attach it to the lobby so invitees receive tournament context.
  let tournamentPayload = undefined;
  if (gameMode === "tournament") {
    try {
      const tournamentName = isLocalTournament ? "Local Tournament" : "Tournament";

      // Add AI players as full tournament participants
      const tournamentPlayerIds = [...effectivePlayerIds];
      const tournamentUsernames: { [key: number]: string } = { ...effectivePlayerUsernames };
      for (let i = 0; i < (aiCount || 0); i++) {
        const aiId = AI_PLAYER_ID_BASE - i;
        tournamentPlayerIds.push(aiId);
        tournamentUsernames[aiId] = `AI ${i + 1}`;
      }

      const tResult = tournamentManager.createTournament(
        tournamentName,
        tournamentPlayerIds,
        ballCount,
        maxScore,
        tournamentUsernames,
        isLocalTournament || false,
        isLocalTournament ? user_id : undefined
      );
      if (!tResult.isErr()) {
        const tournament = tResult.unwrap();
        // Record the tournamentId on the lobby so it can be looked up later
        lobbyManager.setTournamentId(lobby.lobbyId, tournament.tournamentId);
        tournamentPayload = tournament;
        console.log(`[Pong] Created ${isLocalTournament ? 'local ' : ''}tournament ${tournament.tournamentId} for lobby ${lobby.lobbyId}`);
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
    aiCount: lobby.aiCount,
    status: lobby.status,
  };
  if (tournamentPayload) responsePayload.tournament = tournamentPayload;

  return Result.Ok(response.select("LobbyCreated").replyTo(playerIds, responsePayload));
});

socket.registerHandler(user_url.ws.pong.togglePlayerReady, async (body, response) => {
  const user_id = body.userId;
  const { lobbyId } = body.payload;

  // Try by lobbyId first, then fall back to player lookup (frontend may have stale temp ID)
  let toggleResult = lobbyManager.togglePlayerReady(lobbyId, user_id);
  if (toggleResult.isErr()) {
    const playerLobby = lobbyManager.getLobbyForPlayer(user_id);
    if (playerLobby) {
      console.log(`[Pong] togglePlayerReady: lobbyId ${lobbyId} not found, using player lookup -> lobby ${playerLobby.lobbyId}`);
      toggleResult = lobbyManager.togglePlayerReady(playerLobby.lobbyId, user_id);
    }
  }

  if (toggleResult.isErr()) {
    return Result.Ok(response.select("NotInLobby").reply({
      message: toggleResult.unwrapErr().message,
    }));
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
      ballCount: lobby.ballCount,
      maxScore: lobby.maxScore,
      allowPowerups: lobby.allowPowerups,
      status: lobby.status,
      aiCount: lobby.aiCount || 0,
    }
  ));
});

socket.registerHandler(user_url.ws.pong.leaveLobby, async (body, response) => {
  const user_id = body.userId;
  const { lobbyId } = body.payload;

  let lobby = lobbyManager.getLobby(lobbyId);
  if (!lobby) {
    lobby = lobbyManager.getLobbyForPlayer(user_id);
    if (lobby) {
      console.log(`[Pong] leaveLobby: lobbyId ${lobbyId} not found, using player lookup -> lobby ${lobby.lobbyId}`);
    }
  }
  if (!lobby) {
    return Result.Ok(response.select("NotInLobby").reply({
      message: "Lobby not found",
    }));
  }

  const removeResult = lobbyManager.removePlayerFromLobby(lobby.lobbyId, user_id);

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

  // Notify remaining players of updated lobby state
  const remainingPlayerIds = updatedLobby.players.map((p) => p.userId);
  if (remainingPlayerIds.length > 0) {
    socket.sendMessage(user_url.ws.pong.leaveLobby, {
      recipients: remainingPlayerIds,
      code: user_url.ws.pong.leaveLobby.schema.output.LobbyUpdate.code,
      payload: {
        lobbyId: updatedLobby.lobbyId,
        gameMode: updatedLobby.gameMode,
        players: updatedLobby.players,
        ballCount: updatedLobby.ballCount,
        maxScore: updatedLobby.maxScore,
        allowPowerups: updatedLobby.allowPowerups,
        aiCount: updatedLobby.aiCount || 0,
        status: updatedLobby.status,
      },
    });
  }

  // Notify leaving player they left
  return Result.Ok(response.select("LeftLobby").reply({
    message: "Left lobby",
  }));
});

// Handler for joining a specific tournament match
socket.registerHandler(user_url.ws.pong.joinTournamentMatch, async (body, response) => {
  const user_id = body.userId;
  const { tournamentId, matchId, asLocalHost } = body.payload;
  
  console.log(`[Pong] Join tournament match request: user=${user_id}, tournament=${tournamentId}, match=${matchId}, asLocalHost=${asLocalHost}`);

  const tournament = tournamentManager.getTournament(tournamentId);
  if (!tournament) {
    return Result.Ok(response.select("MatchNotReady").reply({
      message: "Tournament not found",
    }));
  }

  const match = tournament.matches.find(m => m.matchId === matchId);
  if (!match) {
    return Result.Ok(response.select("MatchNotReady").reply({
      message: "Match not found",
    }));
  }

  // Verify user is a participant in this match (or local tournament host)
  const isLocalTournament = tournament.isLocal && tournament.hostUserId === user_id;
  if (!isLocalTournament && match.player1Id !== user_id && match.player2Id !== user_id) {
    return Result.Ok(response.select("NotYourMatch").reply({
      message: "You are not a participant in this match",
    }));
  }

  // Check if match is ready (both players set and pending)
  if (match.status !== "pending" || match.player1Id === null || match.player2Id === null) {
    return Result.Ok(response.select("MatchNotReady").reply({
      message: "Match is not ready to start",
    }));
  }

  // For local tournaments: auto-ready both players and start immediately
  if (isLocalTournament) {
    console.log(`[Pong] Local tournament: host ${user_id} starting match ${matchId} (${match.player1Id} vs ${match.player2Id})`);
    
    // Build playerUsernames from tournament player data
    const tournamentPlayerUsernames: { [key: number]: string } = {};
    for (const p of tournament.players) {
      tournamentPlayerUsernames[p.userId] = p.alias || p.username;
    }

    const playerIds = [match.player1Id, match.player2Id];
    const matchAiPlayerIds = playerIds.filter(id => isAiPlayer(id));

    // Start game as a local match with the host controlling both paddles
    const gameResult = singletonPong.startGame(
      playerIds,
      createGameOptionsFromLobby(tournament.ballCount, false, tournament.maxScore),
      tournamentId,
      matchId,
      matchAiPlayerIds,
      tournamentPlayerUsernames,
      user_id // localHostUserId - the host controls both paddles
    );

    if (gameResult.isErr()) {
      return Result.Ok(response.select("MatchNotReady").reply({
        message: "Failed to start game",
      }));
    }

    const gameId = gameResult.unwrap();
    const startResult = tournamentManager.startTournamentMatch(tournamentId, matchId, user_id, gameId);
    if (startResult.isErr()) {
      console.warn(`[Pong] Failed to start local tournament match: ${startResult.unwrapErr().message}`);
    }

    const gameState = singletonPong.getGameState(user_id, gameId);
    if (gameState.isErr()) {
      return Result.Ok(response.select("MatchNotReady").reply({
        message: "Failed to retrieve game state",
      }));
    }

    console.log(`[Pong] Local tournament match ${matchId} started with game ${gameId}`);

    // Return game state to the host (who controls both paddles)
    return Result.Ok(response.select("MatchStarted").reply(gameState.unwrap()));
  }

  // Normal (remote) tournament match flow below

  // Mark this player as ready
  const readyResult = tournamentManager.markPlayerReady(tournamentId, matchId, user_id);
  if (readyResult.isErr()) {
    return Result.Ok(response.select("MatchNotReady").reply({
      message: readyResult.unwrapErr().message,
    }));
  }

  let { bothReady } = readyResult.unwrap();
  const playerIds = [match.player1Id, match.player2Id];

  // Auto-ready AI opponent if the other player is AI
  if (!bothReady) {
    const opponentId = match.player1Id === user_id ? match.player2Id : match.player1Id;
    if (opponentId !== null && isAiPlayer(opponentId)) {
      console.log(`[Pong] Auto-readying AI opponent ${opponentId} for match ${matchId}`);
      const aiReadyResult = tournamentManager.markPlayerReady(tournamentId, matchId, opponentId);
      if (!aiReadyResult.isErr()) {
        bothReady = aiReadyResult.unwrap().bothReady;
      }
    }
  }

  // If not both ready, notify waiting and broadcast updated ready status to all tournament players
  if (!bothReady) {
    console.log(`[Pong] Player ${user_id} ready for match ${matchId}, waiting for opponent`);
    
    // Broadcast tournament state update to all tournament players so they see the ready status in realtime
    const allTournamentPlayerIds = filterHumanIds(tournament.players.map(p => p.userId));
    const tournamentData = {
      tournamentId: tournament.tournamentId,
      name: tournament.name,
      mode: tournament.mode,
      players: tournament.players,
      matches: tournament.matches,
      currentRound: tournament.currentRound,
      totalRounds: tournament.totalRounds,
      status: tournament.status,
      winnerId: tournament.winnerId,
      ballCount: tournament.ballCount,
      maxScore: tournament.maxScore,
      onchainTxHashes: tournament.onchainTxHashes || [],
    };

    for (const playerId of allTournamentPlayerIds) {
      const nextMatch = tournamentManager.getNextPendingMatchForPlayer(tournamentId, playerId);
      
      socket.sendMessage(user_url.ws.pong.tournamentMatchResult, {
        recipients: [playerId],
        code: user_url.ws.pong.tournamentMatchResult.schema.output.MatchResult.code,
        payload: {
          tournamentId,
          matchId,
          winnerId: null, // No winner - just a ready status update
          loserId: null,
          tournament: tournamentData,
          nextMatch: nextMatch,
          isTournamentComplete: false,
        },
      });
    }

    return Result.Ok(response.select("WaitingForOpponent").reply({
      message: "Waiting for your opponent to be ready...",
      readyCount: match.readyPlayers.length,
    }));
  }

  console.log(`[Pong] Both players ready for match ${matchId}, starting game`);

  // Both ready - create the game
  // Build playerUsernames from tournament player data for leaderboard display
  const tournamentPlayerUsernames: { [key: number]: string } = {};
  for (const p of tournament.players) {
    tournamentPlayerUsernames[p.userId] = p.alias || p.username;
  }
  // Detect AI players in this match for AI controller setup
  const matchAiPlayerIds = playerIds.filter(id => isAiPlayer(id));
  const gameResult = singletonPong.startGame(
    playerIds,
    createGameOptionsFromLobby(tournament.ballCount, false, tournament.maxScore),
    tournamentId,
    matchId,
    matchAiPlayerIds,
    tournamentPlayerUsernames
  );

  if (gameResult.isErr()) {
    // Clear ready status so they can try again
    tournamentManager.clearMatchReadyStatus(tournamentId, matchId);
    return Result.Ok(response.select("MatchNotReady").reply({
      message: "Failed to start game",
    }));
  }

  const gameId = gameResult.unwrap();

  // Update match status
  const startResult = tournamentManager.startTournamentMatch(tournamentId, matchId, user_id, gameId);
  if (startResult.isErr()) {
    console.warn(`[Pong] Failed to start tournament match: ${startResult.unwrapErr().message}`);
  }

  // Get game state
  const gameState = singletonPong.getGameState(user_id, gameId);
  if (gameState.isErr()) {
    return Result.Ok(response.select("MatchNotReady").reply({
      message: "Failed to retrieve game state",
    }));
  }

  console.log(`[Pong] Tournament match ${matchId} started with game ${gameId}, players: ${playerIds.join(', ')}`);

  // Broadcast tournament state update to all tournament players so they can spectate
  const allTournamentPlayerIds = filterHumanIds(tournament.players.map(p => p.userId));
  const spectatorIds = allTournamentPlayerIds.filter(id => !playerIds.includes(id));
  
  if (spectatorIds.length > 0) {
    const tournamentData = {
      tournamentId: tournament.tournamentId,
      name: tournament.name,
      mode: tournament.mode,
      players: tournament.players,
      matches: tournament.matches,
      currentRound: tournament.currentRound,
      totalRounds: tournament.totalRounds,
      status: tournament.status,
      winnerId: tournament.winnerId,
      ballCount: tournament.ballCount,
      maxScore: tournament.maxScore,
      onchainTxHashes: tournament.onchainTxHashes || [],
    };

    for (const playerId of spectatorIds) {
      const nextMatch = tournamentManager.getNextPendingMatchForPlayer(tournamentId, playerId);
      
      socket.sendMessage(user_url.ws.pong.tournamentMatchResult, {
        recipients: [playerId],
        code: user_url.ws.pong.tournamentMatchResult.schema.output.MatchResult.code,
        payload: {
          tournamentId,
          matchId,
          winnerId: null, // No winner yet - match just started
          loserId: null,
          tournament: tournamentData,
          nextMatch: nextMatch,
          isTournamentComplete: false,
        },
      });
    }
  }

  // Return game state to human players in this match
  return Result.Ok({
    recipients: filterHumanIds(playerIds),
    code: user_url.ws.pong.joinTournamentMatch.schema.output.MatchStarted.code,
    payload: gameState.unwrap(),
  });
});

// Handler for spectating a tournament match
socket.registerHandler(user_url.ws.pong.spectateMatch, async (body, response) => {
  const user_id = body.userId;
  const { tournamentId, matchId } = body.payload;
  
  console.log(`[Pong] Spectate request: user=${user_id}, tournament=${tournamentId}, match=${matchId}`);

  const tournament = tournamentManager.getTournament(tournamentId);
  if (!tournament) {
    return Result.Ok(response.select("NotInTournament").reply({
      message: "Tournament not found",
    }));
  }

  // Verify user is in this tournament (only tournament participants can spectate)
  const isParticipant = tournament.players.some(p => p.userId === user_id);
  if (!isParticipant) {
    return Result.Ok(response.select("NotInTournament").reply({
      message: "You are not a participant in this tournament",
    }));
  }

  const match = tournament.matches.find(m => m.matchId === matchId);
  if (!match) {
    return Result.Ok(response.select("MatchNotInProgress").reply({
      message: "Match not found",
    }));
  }

  // Only allow spectating matches that are in progress
  if (match.status !== "in_progress") {
    return Result.Ok(response.select("MatchNotInProgress").reply({
      message: "Match is not currently in progress",
    }));
  }

  // Find the game ID for this match
  const gameId = singletonPong.getGameIdByTournamentMatch(tournamentId, matchId);
  if (gameId === null) {
    return Result.Ok(response.select("MatchNotInProgress").reply({
      message: "Game not found for this match",
    }));
  }

  // Add user as spectator
  const spectateResult = singletonPong.addSpectator(user_id, gameId);
  if (spectateResult.isErr()) {
    return Result.Ok(response.select("MatchNotInProgress").reply({
      message: spectateResult.unwrapErr(),
    }));
  }

  console.log(`[Pong] User ${user_id} now spectating match ${matchId} (game ${gameId})`);

  return Result.Ok(response.select("Spectating").reply(spectateResult.unwrap()));
});

// Handler for passively watching all in-progress tournament matches (for mini-preview in bracket)
socket.registerHandler(user_url.ws.pong.watchTournamentMatches, async (body, response) => {
  const user_id = body.userId;
  const { tournamentId } = body.payload;

  console.log(`[Pong] Watch tournament request: user=${user_id}, tournament=${tournamentId}`);

  const tournament = tournamentManager.getTournament(tournamentId);
  if (!tournament) {
    return Result.Ok(response.select("NotInTournament").reply({
      message: "Tournament not found",
    }));
  }

  // Verify user is in this tournament
  const isParticipant = tournament.players.some(p => p.userId === user_id);
  if (!isParticipant) {
    return Result.Ok(response.select("NotInTournament").reply({
      message: "You are not a participant in this tournament",
    }));
  }

  // Find all in-progress matches and add user as spectator to each
  const watching: Array<{ matchId: number; gameId: number }> = [];
  for (const match of tournament.matches) {
    if (match.status !== "in_progress") continue;
    
    const gameId = singletonPong.getGameIdByTournamentMatch(tournamentId, match.matchId);
    if (gameId === null) continue;

    // Don't add if user is already a player in this game
    const addResult = singletonPong.addSpectator(user_id, gameId);
    if (addResult.isOk()) {
      watching.push({ matchId: match.matchId, gameId });
    }
  }

  console.log(`[Pong] User ${user_id} now watching ${watching.length} tournament matches`);

  return Result.Ok(response.select("Watching").reply({ watching }));
});

socket.registerHandler(user_url.ws.pong.startFromLobby, async (body, response) => {
  const user_id = body.userId;
  const { lobbyId } = body.payload;

  // Try by lobbyId first, then fall back to player lookup (frontend may have stale temp ID)
  let lobby = lobbyManager.getLobby(lobbyId);
  if (!lobby) {
    lobby = lobbyManager.getLobbyForPlayer(user_id);
    if (lobby) {
      console.log(`[Pong] startFromLobby: lobbyId ${lobbyId} not found, using player lookup -> lobby ${lobby.lobbyId}`);
    }
  }
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
  const canStartResult = lobbyManager.canStartGame(lobby.lobbyId);
  if (canStartResult.isErr() || !canStartResult.unwrap()) {
    return Result.Ok(response.select("NotAllReady").reply({
      message: canStartResult.isErr() ? canStartResult.unwrapErr().message : "Not all players are ready",
    }));
  }

  // Get tournament and match info if this is a tournament game
  let tournamentId: number | undefined;
  let matchId: number | undefined;
  
  if (lobby.tournamentId) {
    tournamentId = lobby.tournamentId;
    
    // Ensure bracket is generated before looking for matches
    const bracketResult = tournamentManager.ensureBracketGenerated(tournamentId);
    if (bracketResult.isErr()) {
      console.warn(`[Pong] Failed to generate bracket: ${bracketResult.unwrapErr().message}`);
    }
    
    // Find the next pending match for the host
    const pendingMatch = tournamentManager.getNextPendingMatchForPlayer(tournamentId, user_id);
    if (pendingMatch) {
      matchId = pendingMatch.matchId;
      console.log(`[Pong] Starting tournament match: tournament=${tournamentId}, match=${matchId}, players=${pendingMatch.player1Id} vs ${pendingMatch.player2Id}`);
    } else {
      console.warn(`[Pong] No pending match found for user ${user_id} in tournament ${tournamentId}`);
    }
  }

  // Create the actual pong game with maxScore
  // For tournament matches, use only the match players (not all lobby players)
  let playerIds: number[];
  if (matchId && tournamentId) {
    const pendingMatch = tournamentManager.getNextPendingMatchForPlayer(tournamentId, user_id);
    if (pendingMatch && pendingMatch.player1Id !== null && pendingMatch.player2Id !== null) {
      playerIds = [pendingMatch.player1Id, pendingMatch.player2Id];
    } else {
      playerIds = lobby.players.map((p) => p.userId);
    }
  } else {
    playerIds = lobby.players.map((p) => p.userId);
  }
  
  // For 1v1 local mode with only 1 player and NO AI, add a virtual guest player.
  // Use -999 to avoid conflict with -1 which means "no player" in wall segments.
  // When AI players are present they fill the opponent slot, so adding a guest
  // would create an extra player and produce a triangular arena instead of a
  // square one.
  const GUEST_PLAYER_ID = -999;
  if (lobby.gameMode === "1v1" && playerIds.length === 1 && (!lobby.aiCount || lobby.aiCount === 0)) {
    playerIds.push(GUEST_PLAYER_ID);
    console.log(`[Pong] Added guest player for local 1v1 mode`);
  }
  
  // Add AI players if requested (NOT for tournament bracket matches — AI already in bracket)
  const aiPlayerIds: number[] = [];
  if (!tournamentId) {
    for (let i = 0; i < (lobby.aiCount || 0); i++) {
      const aiId = AI_PLAYER_ID_BASE - i;
      playerIds.push(aiId);
      aiPlayerIds.push(aiId);
      console.log(`[Pong] Added AI player ${i + 1} with ID ${aiId}`);
    }
  } else {
    // For tournament matches, detect AI players already in the match playerIds
    for (const id of playerIds) {
      if (isAiPlayer(id)) {
        aiPlayerIds.push(id);
      }
    }
    if (aiPlayerIds.length > 0) {
      console.log(`[Pong] Tournament match includes AI players: ${aiPlayerIds.join(', ')}`);
    }
  }
  
  // Build playerUsernames from lobby players (or tournament players) for leaderboard
  const lobbyPlayerUsernames: { [key: number]: string } = {};
  for (const p of lobby.players) {
    lobbyPlayerUsernames[p.userId] = p.username;
  }
  // For tournament matches, also include AI and tournament player names
  if (tournamentId) {
    const tournament = tournamentManager.getTournament(tournamentId);
    if (tournament) {
      for (const p of tournament.players) {
        lobbyPlayerUsernames[p.userId] = p.alias || p.username;
      }
    }
  }

  const gameResult = singletonPong.startGame(
    playerIds, 
    createGameOptionsFromLobby(lobby.ballCount, lobby.allowPowerups, lobby.maxScore, lobby.gameMode),
    tournamentId,
    matchId,
    aiPlayerIds, // Pass AI player IDs so pongManager can set up AI controllers
    lobbyPlayerUsernames, // Pass player usernames for leaderboard
    undefined, // localHostUserId
    lobby.aiDifficulty as AIDifficulty || AIDifficulty.HARD
  );

  if (gameResult.isErr()) {
    return Result.Ok(response.select("NotAllReady").reply({
      message: "Failed to start game",
    }));
  }

  // Get the game_id from the startGame response
  const gameId = gameResult.unwrap();

  // If this is a tournament match, update the match status
  if (tournamentId && matchId) {
    const startResult = tournamentManager.startTournamentMatch(tournamentId, matchId, user_id, gameId);
    if (startResult.isErr()) {
      console.warn(`[Pong] Failed to start tournament match: ${startResult.unwrapErr().message}`);
    }
  }

  // Mark lobby as in progress
  lobbyManager.startGame(lobbyId, user_id, gameId);

  // Get game state directly
  const gameState = singletonPong.getGameState(user_id, gameId);
  if (gameState.isErr()) {
    return Result.Ok(response.select("NotAllReady").reply({
      message: "Failed to retrieve game state",
    }));
  }

  // For tournament games, notify players NOT in this match to view the bracket
  if (tournamentId) {
    const tournament = tournamentManager.getTournament(tournamentId);
    if (tournament) {
      const matchPlayerIds = new Set(playerIds);
      const otherPlayerIds = filterHumanIds(tournament.players
        .map(p => p.userId)
        .filter(id => !matchPlayerIds.has(id)));
      
      if (otherPlayerIds.length > 0) {
        console.log(`[Pong] Notifying non-match players ${otherPlayerIds.join(', ')} to view tournament bracket`);
        
        // Build tournament data for the notification
        const tournamentData = {
          tournamentId: tournament.tournamentId,
          name: tournament.name,
          mode: tournament.mode,
          players: tournament.players,
          matches: tournament.matches,
          currentRound: tournament.currentRound,
          totalRounds: tournament.totalRounds,
          status: tournament.status,
          winnerId: tournament.winnerId,
          ballCount: tournament.ballCount,
          maxScore: tournament.maxScore,
          onchainTxHashes: tournament.onchainTxHashes || [],
        };

        // Send tournament update to players not in current match
        // They should go to tournament view and wait (or play their own match)
        for (const playerId of otherPlayerIds) {
          const nextMatch = tournamentManager.getNextPendingMatchForPlayer(tournamentId, playerId);
          
          socket.sendMessage(user_url.ws.pong.tournamentMatchResult, {
            recipients: [playerId],
            code: user_url.ws.pong.tournamentMatchResult.schema.output.MatchResult.code,
            payload: {
              tournamentId,
              matchId: matchId || 0,
              winnerId: 0, // No winner yet - match just started
              loserId: 0,
              tournament: tournamentData,
              nextMatch: nextMatch,
              isTournamentComplete: false,
            },
          });
        }

        // Auto-start other first-round matches in parallel when tournament begins
        const readyMatches = tournamentManager.getAllReadyMatches(tournamentId);
        for (const pendingMatch of readyMatches) {
          // Skip the match we just started
          if (pendingMatch.matchId === matchId) continue;
          if (pendingMatch.player1Id === null || pendingMatch.player2Id === null) continue;

          const pendingPlayerIds = [pendingMatch.player1Id, pendingMatch.player2Id];
          console.log(`[Pong] Auto-starting parallel match ${pendingMatch.matchId} for players ${pendingPlayerIds.join(', ')}`);

          // Build usernames for this match from tournament player data
          const pendingPlayerUsernames: { [key: number]: string } = {};
          for (const p of tournament.players) {
            pendingPlayerUsernames[p.userId] = p.alias || p.username;
          }

          // Detect AI players in this parallel match
          const pendingAiPlayerIds = pendingPlayerIds.filter(id => isAiPlayer(id));

          const pendingGameResult = singletonPong.startGame(
            pendingPlayerIds,
            createGameOptionsFromLobby(tournament.ballCount, false, tournament.maxScore),
            tournamentId,
            pendingMatch.matchId,
            pendingAiPlayerIds,
            pendingPlayerUsernames
          );

          if (pendingGameResult.isErr()) {
            console.error(`[Pong] Failed to auto-start parallel match ${pendingMatch.matchId}`);
            continue;
          }

          const pendingGameId = pendingGameResult.unwrap();
          tournamentManager.startTournamentMatch(tournamentId, pendingMatch.matchId, pendingMatch.player1Id, pendingGameId);

          const pendingGameState = singletonPong.getGameState(pendingMatch.player1Id, pendingGameId);
          if (pendingGameState.isErr()) {
            console.error(`[Pong] Failed to get game state for auto-started parallel match ${pendingMatch.matchId}`);
            continue;
          }

          // Send MatchStarted to human players only
          const humanPendingPlayerIds = filterHumanIds(pendingPlayerIds);
          if (humanPendingPlayerIds.length > 0) {
            socket.sendMessage(user_url.ws.pong.joinTournamentMatch, {
              recipients: humanPendingPlayerIds,
              code: user_url.ws.pong.joinTournamentMatch.schema.output.MatchStarted.code,
              payload: pendingGameState.unwrap(),
            });
          }
        }
      }
    }
  }

  // Clean up lobby now that game has started
  console.log(`[Pong] Game ${gameId} started from lobby ${lobbyId}, removing lobby`);
  lobbyManager.removeLobby(lobbyId);

  return Result.Ok({
    recipients: filterHumanIds(playerIds),
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
fastify.get('/metrics', async (request: any, reply: any) => {
  try {
    reply.header('Content-Type', client.register.contentType);
    const metrics = await client.register.metrics();
    return reply.send(metrics);
  } catch (err) {
    reply.status(500).send('Could not collect metrics');
  }
});

// Public API: Get tournament stats including on-chain tx hashes
fastify.get('/public_api/pong/tournaments/:id/stats', async (request: any, reply: any) => {
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
fastify.post('/api/pong/blockchain/record_score', async (request: any, reply: any) => {
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

fastify.listen({ port, host }, (err: any, address: any) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`Server listening at ${address}`);
});
