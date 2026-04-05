import { int_url, user_url } from "@app/shared/api/service/common/endpoints";
import { Result } from "@app/shared/api/service/common/result";
import { PongGame, PongGameOptions } from "./game/game";
import { OurSocket } from "@app/shared/socket_to_hub";
import containers from "@app/shared/internal_api";
import { AIManager } from "./aiController";

type TimestampedInput = {
  keys: string[];
  clientTime: number;
  serverReceiveTime: number;
};

type gameDataType = {
  disconnected_players: number[];
  last_frame_time: number;
  ready_players: number[];
  game: PongGame;
  didGameEnd: boolean;
  playerInputHistory: Map<number, TimestampedInput[]>;
  playerRTT: Map<number, number>;
  tournamentId?: number;
  matchId?: number;
  spectators: number[];
  aiManager: AIManager;
  playerUsernames: { [key: number]: string };
  localHostUserId?: number;
};

const PONG_FRAME_INTERVAL_MS = 16;
const GAME_CLEANUP_DELAY_MS = 30000;
const INPUT_HISTORY_MAX_AGE_MS = 500;
const DEFAULT_RTT_MS = 50;

type TournamentMatchEndCallback = (tournamentId: number, matchId: number, winnerId: number) => Promise<void>;

export class PongManager {
  private static instance: PongManager | null = null;
  public games: Map<number, gameDataType>;
  private playerToGame: Map<number, number>;
  private tournamentMatchEndCallback?: TournamentMatchEndCallback;

  private hubSocket: OurSocket;

  constructor(hubSocket: OurSocket) {
    this.games = new Map();
    this.playerToGame = new Map();
    this.hubSocket = hubSocket;
    if (PongManager.instance !== null) {
      return PongManager.instance;
    }
    PongManager.instance = this;

    setInterval(() => {
      this.handleGameFrames();
    }, PONG_FRAME_INTERVAL_MS);
    return this;
  }

  public setTournamentMatchEndCallback(callback: TournamentMatchEndCallback): void {
    this.tournamentMatchEndCallback = callback;
  }

  private handleGameFrames() {
    const now = Date.now();
    for (const [gameId, gameData] of this.games.entries()) {
      if (gameData.didGameEnd) {
        continue;
      }

      const rawDelta = (now - gameData.last_frame_time) / 1000.0;
      const deltaTime = Math.min(rawDelta, 0.1);

      if (gameData.aiManager.count > 0) {
        const currentGameState = gameData.game.fetchBoardJSON();
        gameData.aiManager.refreshAll(currentGameState);
        const aiSpeedBackups: Map<number, number> = new Map();
        for (const [aiPlayerId] of gameData.aiManager.getControllers()) {
          const multiplier = gameData.aiManager.getAISpeedMultiplier(aiPlayerId);
          if (multiplier !== 1.0) {
            const paddles = gameData.game.getPlayerPaddles(aiPlayerId);
            for (const paddle of paddles) {
              aiSpeedBackups.set(aiPlayerId, paddle.getSpeed());
              paddle.setSpeedUnclamped(paddle.getSpeed() * multiplier);
            }
          }
          const aiKeys = gameData.aiManager.getAIKeys(aiPlayerId);
          gameData.game.handlePressedKeysForPlayer(aiKeys, aiPlayerId);
        }

        gameData.game.playSimulation(deltaTime);

        for (const [aiPlayerId, originalSpeed] of aiSpeedBackups) {
          const paddles = gameData.game.getPlayerPaddles(aiPlayerId);
          for (const paddle of paddles) {
            paddle.setSpeedUnclamped(originalSpeed);
          }
        }
      } else {
        gameData.game.playSimulation(deltaTime);
      }
      gameData.last_frame_time = Date.now();

      const gameState = gameData.game.fetchBoardJSON();
      gameState.serverTimestamp = now;
      if (gameState.metadata) {
        gameState.metadata.playerUsernames = gameData.playerUsernames;
      } else {
        gameState.metadata = { playerUsernames: gameData.playerUsernames };
      }
      if (gameData.tournamentId !== undefined) {
        gameState.metadata.tournamentId = gameData.tournamentId;
      }
      if (gameData.matchId !== undefined) {
        gameState.metadata.matchId = gameData.matchId;
      }

      const recipients = [...Array.from(gameData.game.getAllPlayerIds()), ...gameData.spectators];
      this.hubSocket.sendMessage(user_url.ws.pong.getGameState, {
        recipients,
        code: user_url.ws.pong.getGameState.schema.output.GameUpdate.code,
        payload: gameState,
      });

      if (gameData.game.isGameOver() && !gameData.didGameEnd) {
        gameData.didGameEnd = true;
        this.onGameEnd(gameId, gameData);
      }
    }
  }

  public startGame(
    players: number[],
    options: PongGameOptions,
    tournamentId?: number,
    matchId?: number,
    aiPlayerIds: number[] = [],
    playerUsernames: { [key: number]: string } = {},
    localHostUserId?: number,
  ): Result<number, null> {
    let game = new PongGame(players, options);

    const playerInputHistory = new Map<number, TimestampedInput[]>();
    const playerRTT = new Map<number, number>();
    for (const playerId of players) {
      playerInputHistory.set(playerId, []);
      playerRTT.set(playerId, DEFAULT_RTT_MS);
    }

    const aiManager = new AIManager();
    for (const aiId of aiPlayerIds) {
      aiManager.addAI(aiId);
    }

    if (aiPlayerIds.length > 0) {
    }

    const completeUsernames: { [key: number]: string } = { ...playerUsernames };
    for (const aiId of aiPlayerIds) {
      const aiIndex = Math.abs(aiId) - 1000;
      if (!completeUsernames[aiId]) {
        completeUsernames[aiId] = `AI ${aiIndex}`;
      }
    }

    const gameData: gameDataType = {
      disconnected_players: [],
      ready_players: [],
      game: game,
      last_frame_time: Date.now(),
      didGameEnd: false,
      playerInputHistory,
      playerRTT,
      spectators: [],
      aiManager,
      playerUsernames: completeUsernames,
    };

    if (tournamentId !== undefined) {
      gameData.tournamentId = tournamentId;
    }
    if (matchId !== undefined) {
      gameData.matchId = matchId;
    }

    this.games.set(game.id, gameData);

    const GUEST_PLAYER_ID = -999;
    const isLocal1v1 = players.includes(GUEST_PLAYER_ID);
    const isLocalMatch = isLocal1v1 || (localHostUserId !== undefined);

    if (localHostUserId !== undefined) {
      gameData.localHostUserId = localHostUserId;
      this.playerToGame.set(localHostUserId, game.id);
      if (!players.includes(localHostUserId)) {
        gameData.spectators.push(localHostUserId);
      }
    }

    for (const playerId of players) {
      this.playerToGame.set(playerId, game.id);
      const isAI = aiPlayerIds.includes(playerId);
      for (const paddle of game.getPlayerPaddles(playerId)) {
        if (isAI) {
          paddle.clearKeys();
          paddle.addLeftKey("arrowleft");
          paddle.addRightKey("arrowright");
        } else if (isLocalMatch) {
          paddle.clearKeys();
          if (playerId === players[1]) {
            paddle.addLeftKey("arrowleft");
            paddle.addRightKey("arrowright");
          } else if (playerId === players[0]) {
            paddle.addLeftKey("a");
            paddle.addRightKey("d");
          }
        } else {
          paddle.addLeftKey("arrowleft");
          paddle.addLeftKey("a");
          paddle.addRightKey("arrowright");
          paddle.addRightKey("d");
        }
      }
    }

    return Result.Ok(game.id);
  }

  public handleUserInput(
    userId: number,
    keys: string[],
    clientTimestamp?: number
  ) {
    const serverReceiveTime = Date.now();

    const gameId = this.playerToGame.get(userId);
    if (gameId === undefined) return;

    const gameData = this.games.get(gameId);
    if (!gameData || gameData.didGameEnd) return;

    const game = gameData.game;
    const parsedKeys = Array.from(new Set(keys.map((key) => key.toLowerCase())));

    if (clientTimestamp !== undefined && clientTimestamp > 0) {
      const inputHistory = gameData.playerInputHistory.get(userId) || [];
      inputHistory.push({
        keys: parsedKeys,
        clientTime: clientTimestamp,
        serverReceiveTime,
      });

      const cutoffTime = serverReceiveTime - INPUT_HISTORY_MAX_AGE_MS;
      while (inputHistory.length > 0 && inputHistory[0]!.serverReceiveTime < cutoffTime) {
        inputHistory.shift();
      }
      gameData.playerInputHistory.set(userId, inputHistory);

      const estimatedOneWayLatency = Math.max(0, serverReceiveTime - clientTimestamp);
      const currentRTT = gameData.playerRTT.get(userId) || DEFAULT_RTT_MS;
      const newRTT = currentRTT * 0.8 + estimatedOneWayLatency * 2 * 0.2;
      gameData.playerRTT.set(userId, Math.min(200, Math.max(10, newRTT)));
    }

    game.handlePressedKeysForPlayer(parsedKeys, userId);

    const GUEST_PLAYER_ID = -999;
    const players = game.getPlayers();
    const isLocal1v1 = players.includes(GUEST_PLAYER_ID);

    if (gameData.localHostUserId === userId && !isLocal1v1) {
      const wasdKeys = parsedKeys.filter(k => k === "a" || k === "d");
      if (players[0] !== undefined) {
        game.handlePressedKeysForPlayer(wasdKeys, players[0]);
      }
      const arrowKeys = parsedKeys.filter(k => k === "arrowleft" || k === "arrowright");
      if (players[1] !== undefined) {
        game.handlePressedKeysForPlayer(arrowKeys, players[1]);
      }
    } else if (isLocal1v1 && userId !== GUEST_PLAYER_ID) {
      const arrowKeys = parsedKeys.filter(k => k === "arrowleft" || k === "arrowright");
      game.handlePressedKeysForPlayer(arrowKeys, GUEST_PLAYER_ID);
    }
  }

  public addSpectator(
    userId: number,
    gameId: number
  ): Result<any, string> {
    const gameData = this.games.get(gameId);
    if (gameData === undefined) {
      return Result.Err("Game not found");
    }

    if (gameData.game.getPlayers().includes(userId)) {
      return Result.Err("You are a player in this game");
    }

    if (gameData.didGameEnd) {
      return Result.Err("Game has already ended");
    }

    if (!gameData.spectators.includes(userId)) {
      gameData.spectators.push(userId);
    }

    const gameState = gameData.game.fetchBoardJSON();
    gameState.serverTimestamp = Date.now();
    gameState.isSpectator = true;
    return Result.Ok(gameState);
  }

  public removeSpectator(userId: number, gameId: number): void {
    const gameData = this.games.get(gameId);
    if (gameData) {
      gameData.spectators = gameData.spectators.filter(id => id !== userId);
    }
  }

  public getGameIdByTournamentMatch(tournamentId: number, matchId: number): number | null {
    for (const [gameId, gameData] of this.games.entries()) {
      if (gameData.tournamentId === tournamentId && gameData.matchId === matchId && !gameData.didGameEnd) {
        return gameId;
      }
    }
    return null;
  }

  public getGameState(
    userId: number,
    gameId: number
  ): Result<any, string> {
    const gameData = this.games.get(gameId);
    if (gameData === undefined) {
      return Result.Err("Game not found");
    }

    const isPlayer = gameData.game.getAllPlayerIds().has(userId);
    const isSpectator = gameData.spectators.includes(userId);

    if (!isPlayer && !isSpectator) {
      return Result.Err("Game not found");
    }

    const gameState = gameData.game.fetchBoardJSON();
    gameState.isSpectator = isSpectator;
    if (gameState.metadata) {
      gameState.metadata.playerUsernames = gameData.playerUsernames;
    } else {
      gameState.metadata = { playerUsernames: gameData.playerUsernames };
    }
    return Result.Ok(gameState);
  }

  public handleUserDisconnect(userId: number): void {
    const gameId = this.playerToGame.get(userId);
    if (gameId === undefined) return;

    const gameData = this.games.get(gameId);
    if (!gameData) return;

    if (!gameData.disconnected_players.includes(userId)) {
      gameData.disconnected_players.push(userId);
    }
    gameData.game.removePlayer(userId);
    this.playerToGame.delete(userId);
  }

  public async onGameEnd(gameId: number, gameData: gameDataType): Promise<void> {
    const game = gameData.game;
    const playerScores = game.fetchPlayerScoreMap();
    const rankings = Array.from(playerScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([playerId, score], index, list) => [playerId, score, list.findIndex(([_, s]) => s === score) + 1]);

    const realPlayerRankings = rankings.filter(([playerId]) => (playerId as number) > 0);

    const storageResult = await containers.db.post(int_url.http.db.storePongGameResults, realPlayerRankings.map(([playerId, score, rank]) => ({
      gameId: game.id,
      userId: playerId as number,
      score: score as number,
      rank: rank as number,
    })), undefined, undefined);
    if (storageResult.isErr()) {
      console.error("Failed to store game results:", storageResult.unwrapErr());
    }

    const winnerId = game.getWinner();
    if (gameData.tournamentId !== undefined && gameData.matchId !== undefined && winnerId !== null) {
      if (this.tournamentMatchEndCallback) {
        try {
          await this.tournamentMatchEndCallback(gameData.tournamentId, gameData.matchId, winnerId);
        } catch (err) {
          console.error("Failed to record tournament match winner:", err);
        }
      }
    }

    setTimeout(() => {
      this.cleanupGame(gameId);
    }, GAME_CLEANUP_DELAY_MS);
  }

  private cleanupGame(gameId: number): void {
    const gameData = this.games.get(gameId);
    if (gameData) {
      for (const playerId of gameData.game.getAllPlayerIds()) {
        if (this.playerToGame.get(playerId) === gameId) {
          this.playerToGame.delete(playerId);
        }
      }
      if (gameData.localHostUserId !== undefined && this.playerToGame.get(gameData.localHostUserId) === gameId) {
        this.playerToGame.delete(gameData.localHostUserId);
      }
      this.games.delete(gameId);
    }
  }
}

