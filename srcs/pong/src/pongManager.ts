import { int_url, user_url } from "@app/shared/api/service/common/endpoints";
import { Result } from "@app/shared/api/service/common/result";
import { PongGame, PongGameOptions } from "./game/game";
import { OurSocket } from "@app/shared/socket_to_hub";
import containers from "@app/shared/internal_api";

// Input with timestamp for lag compensation
type TimestampedInput = {
  keys: string[];
  clientTime: number;  // Client's timestamp when input was sent
  serverReceiveTime: number;  // Server's time when input was received
};

type gameDataType = {
  disconnected_players: number[];
  last_frame_time: number;
  ready_players: number[];
  game: PongGame;
  didGameEnd: boolean;
  // Lag compensation: track recent inputs per player
  playerInputHistory: Map<number, TimestampedInput[]>;
  // Estimated RTT per player (rolling average)
  playerRTT: Map<number, number>;
};

const PONG_FRAME_INTERVAL_MS = 50; // Approx 20 FPS
const GAME_CLEANUP_DELAY_MS = 30000; // Clean up game 30 seconds after it ends
const INPUT_HISTORY_MAX_AGE_MS = 500; // Keep inputs for 500ms for lag compensation
const DEFAULT_RTT_MS = 50; // Default assumed RTT

export class PongManager {
  private static instance: PongManager | null = null;
  public games: Map<number, gameDataType>;
  private playerToGame: Map<number, number>; // userId -> gameId for O(1) lookup

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

  private handleGameFrames() {
    const now = Date.now();
    for (const gameData of this.games.values()) {
      if (gameData.game.isGameOver()) {
        if (gameData.didGameEnd === false) {
          gameData.didGameEnd = true;
          this.onGameEnd(gameData.game);
        }
        continue;
      }

      const deltaTime = (now - gameData.last_frame_time) / 1000.0;
      gameData.game.playSimulation(deltaTime);
      gameData.last_frame_time = now;
      
      // Fetch game state and add server timestamp for client-side lag compensation
      const gameState = gameData.game.fetchBoardJSON();
      gameState.serverTimestamp = now;  // Add server timestamp
      
      this.hubSocket.sendMessage(user_url.ws.pong.getGameState, {
        recipients: Array.from(gameData.game.getUniquePlayerIds()),
        code: user_url.ws.pong.getGameState.schema.output.GameUpdate.code,
        payload: gameState,
      });
    }
  }

  public startGame(
    players: number[],
    options: PongGameOptions
  ): Result<number, null> {
    let game = new PongGame(players, options);
    
    // Initialize input history and RTT tracking for each player
    const playerInputHistory = new Map<number, TimestampedInput[]>();
    const playerRTT = new Map<number, number>();
    for (const playerId of players) {
      playerInputHistory.set(playerId, []);
      playerRTT.set(playerId, DEFAULT_RTT_MS);
    }
    
    this.games.set(game.id, {
      disconnected_players: [],
      ready_players: [],
      game: game,
      last_frame_time: Date.now(),
      didGameEnd: false,
      playerInputHistory,
      playerRTT,
    });

    // Register players for O(1) lookup
    for (const playerId of players) {
      this.playerToGame.set(playerId, game.id);
      for (const paddle of game.getPlayerPaddles(playerId)) {
        paddle.addLeftKey("arrowleft");
        paddle.addLeftKey("a");
        paddle.addRightKey("arrowright");
        paddle.addRightKey("d");
      }
    }

    return Result.Ok(game.id);
  }

  public handleUserInput(
    userId: number,
    keys: string[],
    clientTimestamp?: number  // Optional: client's timestamp when input was sent
  ) {
    const serverReceiveTime = Date.now();
    
    // O(1) lookup instead of iterating all games
    const gameId = this.playerToGame.get(userId);
    if (gameId === undefined) return;
    
    const gameData = this.games.get(gameId);
    if (!gameData || gameData.didGameEnd) return;

    const game = gameData.game;
    const parsedKeys = Array.from(new Set(keys.map((key) => key.toLowerCase())));
    
    // LAG COMPENSATION: If client sent a timestamp, we can estimate RTT
    // and apply the input as if it happened in the past
    if (clientTimestamp !== undefined && clientTimestamp > 0) {
      // Store input in history for this player
      const inputHistory = gameData.playerInputHistory.get(userId) || [];
      inputHistory.push({
        keys: parsedKeys,
        clientTime: clientTimestamp,
        serverReceiveTime,
      });
      
      // Clean up old inputs (older than INPUT_HISTORY_MAX_AGE_MS)
      const cutoffTime = serverReceiveTime - INPUT_HISTORY_MAX_AGE_MS;
      while (inputHistory.length > 0 && inputHistory[0]!.serverReceiveTime < cutoffTime) {
        inputHistory.shift();
      }
      gameData.playerInputHistory.set(userId, inputHistory);
      
      // Update RTT estimate (simple rolling average)
      // Note: This assumes client and server clocks are reasonably synchronized
      // In practice, we'd use a ping-pong mechanism for accurate RTT
      const estimatedOneWayLatency = Math.max(0, serverReceiveTime - clientTimestamp);
      const currentRTT = gameData.playerRTT.get(userId) || DEFAULT_RTT_MS;
      // Exponential moving average (alpha = 0.2)
      const newRTT = currentRTT * 0.8 + estimatedOneWayLatency * 2 * 0.2;
      gameData.playerRTT.set(userId, Math.min(200, Math.max(10, newRTT))); // Clamp between 10-200ms
    }
    
    // Apply input immediately (standard behavior)
    // The lag compensation happens on the DISPLAY side - we send paddle velocity
    // and let the client extrapolate forward
    game.handlePressedKeysForPlayer(parsedKeys, userId);
  }

  public getGameState(
    userId: number,
    gameId: number
  ): Result<any, string> {
    const gameData = this.games.get(gameId);
    if (gameData === undefined || !gameData.game.getPlayers().includes(userId))
        return Result.Err("Game not found");
    return Result.Ok(gameData.game.fetchBoardJSON());
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

  public async onGameEnd(game: PongGame): Promise<void> {
    const gameId = game.id;
    const playerScores = game.fetchPlayerScoreMap();
    const rankings = Array.from(playerScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([playerId, score], index, list) => [playerId, score, list.findIndex(([_, s]) => s === score) + 1]);

    const storageResult = await containers.db.post(int_url.http.db.storePongGameResults, rankings.map(([playerId, score, rank]) => ({
      gameId: game.id,
      userId: playerId as number,
      score: score as number,
      rank: rank as number,
    })), undefined, undefined);
    if (storageResult.isErr()) {
      console.error("Failed to store game results:", storageResult.unwrapErr());
    } else {
      console.log("Game results stored successfully.");
    }
    console.log("Game ended. Final rankings:", rankings);

    // Schedule cleanup after delay to allow clients to fetch final state
    setTimeout(() => {
      this.cleanupGame(gameId);
    }, GAME_CLEANUP_DELAY_MS);
  }

  private cleanupGame(gameId: number): void {
    const gameData = this.games.get(gameId);
    if (gameData) {
      console.log(`[PongManager] Cleaning up game ${gameId}`);
      // Remove player-to-game mappings
      for (const playerId of gameData.game.getPlayers()) {
        this.playerToGame.delete(playerId);
      }
      this.games.delete(gameId);
    }
  }
}

// export default { PongManager };
