"use strict";
import { PongGameOptions } from "./game/game.js";
import { PongManager } from "./pongManager.js";

import LobbyManager from "./lobbyManager.js";
import TournamentManager from "./tournamentManager.js";
import websocketPlugin from "@fastify/websocket";
import { OurSocket } from "@app/shared/socket_to_hub";
import { int_url, user_url } from "@app/shared/api/service/common/endpoints";
import { Result } from "@app/shared/api/service/common/result";
import { createFastify } from "@app/shared/api/service/common/fastify";
import containers from "@app/shared/internal_api";
import { Lobby } from "./lobbyManager.js";
import { PlayerLobbyStatus, LobbyStatus } from "@app/shared/api/service/pong/lobby_interfaces";
import BlockchainService from "./services/blockchainService.js";

const fastify: any = createFastify();

fastify.register(websocketPlugin);

const socket = new OurSocket("pong");
const lobbyManager = new LobbyManager();
const singletonPong = new PongManager(socket);
const tournamentManager = new TournamentManager();
const blockchainService = new BlockchainService();

const AI_PLAYER_ID_BASE = -1001;
function isAiPlayer(userId: number): boolean {
  return userId <= AI_PLAYER_ID_BASE;
}

const LOCAL_PLAYER_ID_BASE = -500;
function isLocalPlayer(userId: number): boolean {
  return userId <= LOCAL_PLAYER_ID_BASE && userId > -999;
}

function filterHumanIds(ids: number[]): number[] {
  return ids.filter(id => !isAiPlayer(id) && !isLocalPlayer(id));
}

singletonPong.setTournamentMatchEndCallback(async (tournamentId, matchId, winnerId) => {
  const result = await tournamentManager.recordMatchWinner(tournamentId, matchId, winnerId);
  if (result.isErr()) {
    console.error("Failed to record match winner:", result.unwrapErr());
    return;
  }

  const tournament = result.unwrap();
  if (tournament.onchainTxHashes && tournament.onchainTxHashes.length > 0) {
  }

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
    allowPowerups: tournament.allowPowerups,
    aiDifficulty: tournament.aiDifficulty,
    onchainTxHashes: tournament.onchainTxHashes || [],
    isLocal: tournament.isLocal,
    hostUserId: tournament.hostUserId,
  };

  const isTournamentComplete = tournament.status === "completed";

  if (tournament.isLocal && tournament.hostUserId) {
    const hostId = tournament.hostUserId;
    const nextMatch = tournamentManager.getNextPendingMatchForPlayer(tournamentId, hostId);
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

    socket.sendMessage(user_url.ws.pong.tournamentMatchResult, {
      recipients: [hostId],
      code: user_url.ws.pong.tournamentMatchResult.schema.output.MatchResult.code,
      payload,
    });

    await autoStartAiVsAiMatches(tournamentId);

    if (isTournamentComplete) {
      setTimeout(() => tournamentManager.removeTournament(tournamentId), 60_000);
    }
    return;
  }

  const matchPlayerIds = filterHumanIds(
    [completedMatch.player1Id, completedMatch.player2Id].filter(id => id !== null) as number[]
  );

  const allPlayerIds = filterHumanIds(tournament.players.map(p => p.userId));

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

    socket.sendMessage(user_url.ws.pong.tournamentMatchResult, {
      recipients: [playerId],
      code: user_url.ws.pong.tournamentMatchResult.schema.output.MatchResult.code,
      payload,
    });
  }

  const otherPlayerIds = allPlayerIds.filter(id => !matchPlayerIds.includes(id));
  for (const playerId of otherPlayerIds) {
    const nextMatch = tournamentManager.getNextPendingMatchForPlayer(tournamentId, playerId);

    const payload = {
      tournamentId,
      matchId,
      winnerId: null,
      loserId: null,
      tournament: tournamentData,
      nextMatch: nextMatch,
      isTournamentComplete,
    };

    socket.sendMessage(user_url.ws.pong.tournamentMatchResult, {
      recipients: [playerId],
      code: user_url.ws.pong.tournamentMatchResult.schema.output.MatchResult.code,
      payload,
    });
  }

  await autoStartAiVsAiMatches(tournamentId);

  if (isTournamentComplete) {
    setTimeout(() => tournamentManager.removeTournament(tournamentId), 60_000);
  }
});

async function autoStartAiVsAiMatches(tournamentId: number): Promise<void> {
  const tournament = tournamentManager.getTournament(tournamentId);
  if (!tournament || tournament.status === "completed") return;

  const readyMatches = tournamentManager.getAllReadyMatches(tournamentId);
  for (const match of readyMatches) {
    if (match.player1Id === null || match.player2Id === null) continue;
    if (!isAiPlayer(match.player1Id) || !isAiPlayer(match.player2Id)) continue;

    const matchPlayerIds = [match.player1Id, match.player2Id];

    const playerUsernames: { [key: number]: string } = {};
    for (const p of tournament.players) {
      playerUsernames[p.userId] = p.alias || p.username;
    }

    const gameResult = singletonPong.startGame(
      matchPlayerIds,
      createGameOptionsFromLobby(tournament.ballCount, tournament.allowPowerups, tournament.maxScore),
      tournamentId,
      match.matchId,
      matchPlayerIds,
      playerUsernames,
    );

    if (gameResult.isErr()) {
      console.error(`[Pong] Failed to auto-start AI vs AI match ${match.matchId}`);
      continue;
    }

    const gameId = gameResult.unwrap();
    tournamentManager.startTournamentMatch(tournamentId, match.matchId, match.player1Id, gameId);

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
      allowPowerups: tournament.allowPowerups,
      aiDifficulty: tournament.aiDifficulty,
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
  const effectiveDuration = 999999;
  const options: PongGameOptions = {
    canvasWidth: 1000,
    canvasHeight: 1000,
    ballSpeed: 450,
    paddleSpeedFactor: 4.0,
    paddleWidthFactor: 0.15,
    paddleHeight: 30,
    paddleWallOffset: 40,
    amountOfBalls: ballCount,
    powerupFrequency: allowPowerups ? 10 : 999999,
    gameDuration: effectiveDuration,
    ...(gameMode ? { gameMode } : {}),
  };
  if (maxScore !== undefined) {
    options.maxScore = maxScore;
  }
  return options;
}

socket.registerHandler(user_url.ws.pong.handleGameKeys, async (body, response) => {
  singletonPong.handleUserInput(
    body.userId,
    body.payload.pressed_keys,
    body.payload.clientTimestamp,
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

socket.registerHandler(user_url.ws.pong.createLobby, async (body, response) => {
  const user_id = body.userId;
  const { gameMode, playerIds, playerUsernames, ballCount, maxScore, allowPowerups, aiCount, aiDifficulty, localPlayerNames } = body.payload;

  const isLocalTournament = gameMode === "tournament" && localPlayerNames && localPlayerNames.length > 0;
  let effectivePlayerIds = [...playerIds];
  let effectivePlayerUsernames = { ...(playerUsernames || {}) };

  if (isLocalTournament) {
    for (let i = 0; i < localPlayerNames.length; i++) {
      const localId = LOCAL_PLAYER_ID_BASE - i;
      effectivePlayerIds.push(localId);
      effectivePlayerUsernames[String(localId)] = localPlayerNames[i]!;
    }
  }

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

  if (isLocalTournament) {
    for (const player of lobby.players) {
      if (isLocalPlayer(player.userId)) {
        player.isReady = true;
      }
    }
  }

  const realPlayerIds = filterHumanIds(effectivePlayerIds);
  if (realPlayerIds.length > 0) {
    const dbPlayers = realPlayerIds.map(id => ({
      userId: id,
      state: id === user_id ? PlayerLobbyStatus.Joined : PlayerLobbyStatus.Invited,
    }));
    const dbSettings: Record<string, string> = {
      gameMode: lobby.gameMode,
      ballCount: String(lobby.ballCount),
      maxScore: String(lobby.maxScore),
      allowPowerups: String(lobby.allowPowerups),
      aiCount: String(lobby.aiCount),
      aiDifficulty: String(lobby.aiDifficulty),
    };
    containers.db.post(int_url.http.db.createLobbyFull, {
      lobbyId: lobby.lobbyId,
      hostUserId: user_id,
      players: dbPlayers,
      settings: dbSettings,
    }).then(res => {
      if (res.isErr()) console.error("[Pong] Failed to persist lobby to DB:", res.unwrapErr());
    });
  }

  let tournamentPayload = undefined;
  if (gameMode === "tournament") {
    try {
      const existingTournament = tournamentManager.getActiveTournamentForPlayer(user_id);
      if (existingTournament) {
        if (existingTournament.status === "completed") {
          tournamentManager.removeTournament(existingTournament.tournamentId);
        }
      }

      const tournamentName = isLocalTournament ? "Local Tournament" : "Tournament";

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
        allowPowerups || false,
        aiDifficulty || 3,
        isLocalTournament || false,
        isLocalTournament ? user_id : undefined
      );
      if (!tResult.isErr()) {
        const tournament = tResult.unwrap();
        lobbyManager.setTournamentId(lobby.lobbyId, tournament.tournamentId);
        tournamentPayload = tournament;
      } else {
        console.error("Failed to create tournament for lobby:", tResult.unwrapErr());
      }
    } catch (e) {
      console.error("Error while creating tournament for lobby:", e);
    }
  }

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

  let toggleResult = lobbyManager.togglePlayerReady(lobbyId, user_id);
  if (toggleResult.isErr()) {
    const playerLobby = lobbyManager.getLobbyForPlayer(user_id);
    if (playerLobby) {
      toggleResult = lobbyManager.togglePlayerReady(playerLobby.lobbyId, user_id);
    }
  }

  if (toggleResult.isErr()) {
    return Result.Ok(response.select("NotInLobby").reply({
      message: toggleResult.unwrapErr().message,
    }));
  }

  const lobby = toggleResult.unwrap();

  const player = lobby.players.find((p) => p.userId === user_id);
  if (player) {
    const newState = player.isReady ? PlayerLobbyStatus.Ready : PlayerLobbyStatus.Joined;
    containers.db.post(int_url.http.db.setLobbyPlayerState, {
      lobbyId: lobby.lobbyId,
      userId: user_id,
      state: newState,
    }).then(res => {
      if (res.isErr()) console.error("[Pong] Failed to persist player ready state to DB:", res.unwrapErr());
    });
  }

  const playerIds = lobby.players.map((p) => p.userId);

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
      aiDifficulty: lobby.aiDifficulty,
    }
  ));
});

export enum ThrowUserOutOfLobbyResult {
  Success,
  LobbyNotFound,
  FailedToRemovePlayer,
  FailedToDeleteLobby,
};

export type ThrowUserOutOfLobbyResultType =
  | { result: ThrowUserOutOfLobbyResult.Success, updatedLobby: Lobby | null }
  | { result: ThrowUserOutOfLobbyResult.LobbyNotFound }
  | { result: ThrowUserOutOfLobbyResult.FailedToRemovePlayer }
  | { result: ThrowUserOutOfLobbyResult.FailedToDeleteLobby }

async function throwUserOutOfLobby(userId: number, lobbyId: number): Promise<ThrowUserOutOfLobbyResultType> {
  let lobby = lobbyManager.getLobbyForPlayer(userId);
  if (!lobby)
    return { result: ThrowUserOutOfLobbyResult.LobbyNotFound };

  if (!isAiPlayer(userId) && !isLocalPlayer(userId)) {
    let result = await containers.db.post(int_url.http.db.setLobbyPlayerState, {
      lobbyId: lobbyId,
      userId,
      state: PlayerLobbyStatus.Left,
    });
    if (result.isErr())
      return { result: ThrowUserOutOfLobbyResult.FailedToRemovePlayer };
  }

  const updatedLobby = lobbyManager.removePlayerFromLobby(lobbyId, userId).unwrap();
  if (updatedLobby === null) {
    let result = await containers.db.post(int_url.http.db.deleteLobbyFromDb, {
      lobbyId: lobbyId,
    });
    if (result.isErr())
      return { result: ThrowUserOutOfLobbyResult.FailedToDeleteLobby };
  } else {
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
          aiDifficulty: updatedLobby.aiDifficulty,
          status: updatedLobby.status,
        },
      });
    }
  }

  return {
    result: ThrowUserOutOfLobbyResult.Success,
    updatedLobby,
  };
}

socket.registerHandler(user_url.ws.pong.leaveLobby, async (body, response) => {
  const removePlayerResult = await throwUserOutOfLobby(body.userId, body.payload.lobbyId);

  switch (removePlayerResult.result) {
    case ThrowUserOutOfLobbyResult.LobbyNotFound:
      return Result.Ok(response.select("NotInLobby").reply({ message: "Lobby not found" }));
    case ThrowUserOutOfLobbyResult.FailedToRemovePlayer:
    case ThrowUserOutOfLobbyResult.FailedToDeleteLobby:
      return Result.Ok(response.select("FailedToLeave").reply({ message: "Something went wrong on our end" }));
    case ThrowUserOutOfLobbyResult.Success:
      return Result.Ok(response.select("LeftLobby").reply({ message: "Left lobby" }));
  }
});

socket.registerHandler(user_url.ws.pong.getLobbyState, async (body, response) => {
  const user_id = body.userId;

  const lobby = lobbyManager.getLobbyForPlayer(user_id);
  if (!lobby) {
    return Result.Ok(response.select("NotInLobby").reply({
      message: "Not in a lobby",
    }));
  }

  return Result.Ok(response.select("LobbyFound").reply({
    lobbyId: lobby.lobbyId,
    gameMode: lobby.gameMode,
    players: lobby.players,
    ballCount: lobby.ballCount,
    maxScore: lobby.maxScore,
    allowPowerups: lobby.allowPowerups,
    aiCount: lobby.aiCount || 0,
    aiDifficulty: lobby.aiDifficulty,
    status: lobby.status,
  }));
});

socket.registerHandler(user_url.ws.pong.declineLobbyInvitation, async (body, response) => {
  const user_id = body.userId;
  const { lobbyId } = body.payload;

  let lobby = lobbyManager.getLobby(lobbyId);
  if (!lobby) {
    lobby = lobbyManager.getLobbyForPlayer(user_id);
  }
  if (!lobby) {
    return Result.Ok(response.select("NotInLobby").reply({
      message: "Lobby not found",
    }));
  }

  const actualLobbyId = lobby.lobbyId;
  const removeResult = lobbyManager.removePlayerFromLobby(actualLobbyId, user_id);

  if (removeResult.isErr()) {
    return Result.Ok(response.select("NotInLobby").reply({
      message: removeResult.unwrapErr().message,
    }));
  }

  const updatedLobby = removeResult.unwrap();

  if (!isAiPlayer(user_id) && !isLocalPlayer(user_id)) {
    containers.db.post(int_url.http.db.setLobbyPlayerState, {
      lobbyId: actualLobbyId,
      userId: user_id,
      state: PlayerLobbyStatus.Declined,
    }).then(res => {
      if (res.isErr()) console.error("[Pong] Failed to persist player decline to DB:", res.unwrapErr());
    });
  }

  if (updatedLobby === null) {
    containers.db.post(int_url.http.db.deleteLobbyFromDb, { lobbyId: actualLobbyId }).then(res => {
      if (res.isErr()) console.error("[Pong] Failed to delete lobby from DB:", res.unwrapErr());
    });
    return Result.Ok(response.select("Declined").reply({
      message: "Invitation declined",
    }));
  }

  const remainingPlayerIds = updatedLobby.players.map((p) => p.userId);
  if (remainingPlayerIds.length > 0) {
    socket.sendMessage(user_url.ws.pong.declineLobbyInvitation, {
      recipients: filterHumanIds(remainingPlayerIds),
      code: user_url.ws.pong.declineLobbyInvitation.schema.output.LobbyUpdate.code,
      payload: {
        lobbyId: updatedLobby.lobbyId,
        gameMode: updatedLobby.gameMode,
        players: updatedLobby.players,
        ballCount: updatedLobby.ballCount,
        maxScore: updatedLobby.maxScore,
        allowPowerups: updatedLobby.allowPowerups,
        aiCount: updatedLobby.aiCount || 0,
        aiDifficulty: updatedLobby.aiDifficulty,
        status: updatedLobby.status,
      },
    });
  }

  return Result.Ok(response.select("Declined").reply({
    message: "Invitation declined",
  }));
});

socket.registerHandler(user_url.ws.pong.joinTournamentMatch, async (body, response) => {
  const user_id = body.userId;
  const { tournamentId, matchId } = body.payload;

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

  const isLocalTournament = tournament.isLocal && tournament.hostUserId === user_id;
  if (!isLocalTournament && match.player1Id !== user_id && match.player2Id !== user_id) {
    return Result.Ok(response.select("NotYourMatch").reply({
      message: "You are not a participant in this match",
    }));
  }

  if (match.status !== "pending" || match.player1Id === null || match.player2Id === null) {
    return Result.Ok(response.select("MatchNotReady").reply({
      message: "Match is not ready to start",
    }));
  }

  if (isLocalTournament) {

    const tournamentPlayerUsernames: { [key: number]: string } = {};
    for (const p of tournament.players) {
      tournamentPlayerUsernames[p.userId] = p.alias || p.username;
    }

    const playerIds = [match.player1Id, match.player2Id];
    const matchAiPlayerIds = playerIds.filter(id => isAiPlayer(id));

    const gameResult = singletonPong.startGame(
      playerIds,
      createGameOptionsFromLobby(tournament.ballCount, tournament.allowPowerups, tournament.maxScore),
      tournamentId,
      matchId,
      matchAiPlayerIds,
      tournamentPlayerUsernames,
      user_id,
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

    return Result.Ok(response.select("MatchStarted").reply(gameState.unwrap()));
  }

  const readyResult = tournamentManager.markPlayerReady(tournamentId, matchId, user_id);
  if (readyResult.isErr()) {
    return Result.Ok(response.select("MatchNotReady").reply({
      message: readyResult.unwrapErr().message,
    }));
  }

  let { bothReady } = readyResult.unwrap();
  const playerIds = [match.player1Id, match.player2Id];

  if (!bothReady) {
    const opponentId = match.player1Id === user_id ? match.player2Id : match.player1Id;
    if (opponentId !== null && isAiPlayer(opponentId)) {
      const aiReadyResult = tournamentManager.markPlayerReady(tournamentId, matchId, opponentId);
      if (!aiReadyResult.isErr()) {
        bothReady = aiReadyResult.unwrap().bothReady;
      }
    }
  }

  if (!bothReady) {

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
      allowPowerups: tournament.allowPowerups,
      aiDifficulty: tournament.aiDifficulty,
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
          winnerId: null,
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

  const tournamentPlayerUsernames: { [key: number]: string } = {};
  for (const p of tournament.players) {
    tournamentPlayerUsernames[p.userId] = p.alias || p.username;
  }
  const matchAiPlayerIds = playerIds.filter(id => isAiPlayer(id));
  const gameResult = singletonPong.startGame(
    playerIds,
    createGameOptionsFromLobby(tournament.ballCount, tournament.allowPowerups, tournament.maxScore),
    tournamentId,
    matchId,
    matchAiPlayerIds,
    tournamentPlayerUsernames,
  );

  if (gameResult.isErr()) {
    tournamentManager.clearMatchReadyStatus(tournamentId, matchId);
    return Result.Ok(response.select("MatchNotReady").reply({
      message: "Failed to start game",
    }));
  }

  const gameId = gameResult.unwrap();

  const startResult = tournamentManager.startTournamentMatch(tournamentId, matchId, user_id, gameId);
  if (startResult.isErr()) {
    console.warn(`[Pong] Failed to start tournament match: ${startResult.unwrapErr().message}`);
  }

  const gameState = singletonPong.getGameState(user_id, gameId);
  if (gameState.isErr()) {
    return Result.Ok(response.select("MatchNotReady").reply({
      message: "Failed to retrieve game state",
    }));
  }

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
      allowPowerups: tournament.allowPowerups,
      aiDifficulty: tournament.aiDifficulty,
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
          winnerId: null,
          loserId: null,
          tournament: tournamentData,
          nextMatch: nextMatch,
          isTournamentComplete: false,
        },
      });
    }
  }

  return Result.Ok({
    recipients: filterHumanIds(playerIds),
    code: user_url.ws.pong.joinTournamentMatch.schema.output.MatchStarted.code,
    payload: gameState.unwrap(),
  });
});

socket.registerHandler(user_url.ws.pong.spectateMatch, async (body, response) => {
  const user_id = body.userId;
  const { tournamentId, matchId } = body.payload;

  const tournament = tournamentManager.getTournament(tournamentId);
  if (!tournament) {
    return Result.Ok(response.select("NotInTournament").reply({
      message: "Tournament not found",
    }));
  }

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

  if (match.status !== "in_progress") {
    return Result.Ok(response.select("MatchNotInProgress").reply({
      message: "Match is not currently in progress",
    }));
  }

  const gameId = singletonPong.getGameIdByTournamentMatch(tournamentId, matchId);
  if (gameId === null) {
    return Result.Ok(response.select("MatchNotInProgress").reply({
      message: "Game not found for this match",
    }));
  }

  const spectateResult = singletonPong.addSpectator(user_id, gameId);
  if (spectateResult.isErr()) {
    return Result.Ok(response.select("MatchNotInProgress").reply({
      message: spectateResult.unwrapErr(),
    }));
  }

  return Result.Ok(response.select("Spectating").reply(spectateResult.unwrap()));
});

socket.registerHandler(user_url.ws.pong.watchTournamentMatches, async (body, response) => {
  const user_id = body.userId;
  const { tournamentId } = body.payload;

  const tournament = tournamentManager.getTournament(tournamentId);
  if (!tournament) {
    return Result.Ok(response.select("NotInTournament").reply({
      message: "Tournament not found",
    }));
  }

  const isParticipant = tournament.players.some(p => p.userId === user_id);
  if (!isParticipant) {
    return Result.Ok(response.select("NotInTournament").reply({
      message: "You are not a participant in this tournament",
    }));
  }

  const watching: Array<{ matchId: number; gameId: number }> = [];
  for (const match of tournament.matches) {
    if (match.status !== "in_progress") continue;

    const gameId = singletonPong.getGameIdByTournamentMatch(tournamentId, match.matchId);
    if (gameId === null) continue;

    const addResult = singletonPong.addSpectator(user_id, gameId);
    if (addResult.isOk()) {
      watching.push({ matchId: match.matchId, gameId });
    }
  }

  return Result.Ok(response.select("Watching").reply({ watching }));
});

socket.registerHandler(user_url.ws.pong.startFromLobby, async (body, response) => {
  const user_id = body.userId;
  const { lobbyId } = body.payload;

  let lobby = lobbyManager.getLobby(lobbyId);
  if (!lobby) {
    lobby = lobbyManager.getLobbyForPlayer(user_id);
    if (lobby) {
    }
  }
  if (!lobby) {
    return Result.Ok(response.select("NotAllReady").reply({
      message: "Lobby not found",
    }));
  }

  const hostPlayer = lobby.players.find((p) => p.isHost);
  if (!hostPlayer || hostPlayer.userId !== user_id) {
    return Result.Ok(response.select("NotHost").reply({
      message: "Only the host can start the game",
    }));
  }

  const canStartResult = lobbyManager.canStartGame(lobby.lobbyId);
  if (canStartResult.isErr() || !canStartResult.unwrap()) {
    return Result.Ok(response.select("NotAllReady").reply({
      message: canStartResult.isErr() ? canStartResult.unwrapErr().message : "Not all players are ready",
    }));
  }

  let tournamentId: number | undefined;
  let matchId: number | undefined;

  if (lobby.tournamentId) {
    tournamentId = lobby.tournamentId;

    const bracketResult = tournamentManager.ensureBracketGenerated(tournamentId);
    if (bracketResult.isErr()) {
      console.warn(`[Pong] Failed to generate bracket: ${bracketResult.unwrapErr().message}`);
    }

    const pendingMatch = tournamentManager.getNextPendingMatchForPlayer(tournamentId, user_id);
    if (pendingMatch) {
      matchId = pendingMatch.matchId;
    } else {
      console.warn(`[Pong] No pending match found for user ${user_id} in tournament ${tournamentId}`);
    }
  }

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

  const GUEST_PLAYER_ID = -999;
  if (lobby.gameMode === "1v1" && playerIds.length === 1 && (!lobby.aiCount || lobby.aiCount === 0)) {
    playerIds.push(GUEST_PLAYER_ID);
  }

  const aiPlayerIds: number[] = [];
  if (!tournamentId) {
    for (let i = 0; i < (lobby.aiCount || 0); i++) {
      const aiId = AI_PLAYER_ID_BASE - i;
      playerIds.push(aiId);
      aiPlayerIds.push(aiId);
    }
  } else {
    for (const id of playerIds) {
      if (isAiPlayer(id)) {
        aiPlayerIds.push(id);
      }
    }
    if (aiPlayerIds.length > 0) {
    }
  }

  const lobbyPlayerUsernames: { [key: number]: string } = {};
  for (const p of lobby.players) {
    lobbyPlayerUsernames[p.userId] = p.username;
  }
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
    aiPlayerIds,
    lobbyPlayerUsernames,
  );

  if (gameResult.isErr()) {
    return Result.Ok(response.select("NotAllReady").reply({
      message: "Failed to start game",
    }));
  }

  const gameId = gameResult.unwrap();

  if (tournamentId && matchId) {
    const startResult = tournamentManager.startTournamentMatch(tournamentId, matchId, user_id, gameId);
    if (startResult.isErr()) {
      console.warn(`[Pong] Failed to start tournament match: ${startResult.unwrapErr().message}`);
    }
  }

  lobbyManager.startGame(lobbyId, user_id, gameId);

  containers.db.post(int_url.http.db.updateLobbyState, {
    lobbyId: lobby.lobbyId,
    state: LobbyStatus.GameInProgress,
  }).then(res => {
    if (res.isErr()) console.error("[Pong] Failed to persist lobby state to DB:", res.unwrapErr());
  });

  const gameState = singletonPong.getGameState(user_id, gameId);
  if (gameState.isErr()) {
    return Result.Ok(response.select("NotAllReady").reply({
      message: "Failed to retrieve game state",
    }));
  }

  if (tournamentId) {
    const tournament = tournamentManager.getTournament(tournamentId);
    if (tournament) {
      const matchPlayerIds = new Set(playerIds);
      const otherPlayerIds = filterHumanIds(tournament.players
        .map(p => p.userId)
        .filter(id => !matchPlayerIds.has(id)));

      if (otherPlayerIds.length > 0) {

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
          allowPowerups: tournament.allowPowerups,
          aiDifficulty: tournament.aiDifficulty,
          onchainTxHashes: tournament.onchainTxHashes || [],
        };

        for (const playerId of otherPlayerIds) {
          const nextMatch = tournamentManager.getNextPendingMatchForPlayer(tournamentId, playerId);

          socket.sendMessage(user_url.ws.pong.tournamentMatchResult, {
            recipients: [playerId],
            code: user_url.ws.pong.tournamentMatchResult.schema.output.MatchResult.code,
            payload: {
              tournamentId,
              matchId: matchId || 0,
              winnerId: 0,
              loserId: 0,
              tournament: tournamentData,
              nextMatch: nextMatch,
              isTournamentComplete: false,
            },
          });
        }

        const readyMatches = tournamentManager.getAllReadyMatches(tournamentId);
        for (const pendingMatch of readyMatches) {
          if (pendingMatch.matchId === matchId) continue;
          if (pendingMatch.player1Id === null || pendingMatch.player2Id === null) continue;

          const pendingPlayerIds = [pendingMatch.player1Id, pendingMatch.player2Id];

          const pendingPlayerUsernames: { [key: number]: string } = {};
          for (const p of tournament.players) {
            pendingPlayerUsernames[p.userId] = p.alias || p.username;
          }

          const pendingAiPlayerIds = pendingPlayerIds.filter(id => isAiPlayer(id));

          const pendingGameResult = singletonPong.startGame(
            pendingPlayerIds,
            createGameOptionsFromLobby(tournament.ballCount, tournament.allowPowerups, tournament.maxScore),
            tournamentId,
            pendingMatch.matchId,
            pendingAiPlayerIds,
            pendingPlayerUsernames,
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

  const playerLobby = lobbyManager.getLobbyForPlayer(userId);
  if (playerLobby !== undefined)
    await throwUserOutOfLobby(userId, playerLobby.lobbyId);

  return Result.Ok(null);
});

const port = parseInt(
  process.env.COMMON_PORT_ALL_DOCKER_CONTAINERS || "3000",
  10
);
const host = process.env.PONG_BIND_TO || "0.0.0.0";

fastify.get('/public_api/pong/tournaments/:id/stats', async (request: any, reply: any) => {
  const idParam = (request.params as any).id;
  const tid = Number(idParam);
  if (Number.isNaN(tid)) return reply.status(400).send({ message: 'invalid tournament id' });

  const tournament = tournamentManager.getTournament(tid);
  if (!tournament) return reply.status(404).send({ message: 'tournament not found' });

  return reply.status(200).send({ tournament });
});

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

