import { int_url, user_url } from "@app/shared/api/service/common/endpoints";
import { Result } from "@app/shared/api/service/common/result";
import { PongGame, PongGameOptions, PowerupType } from "./game/game";
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
  // Tournament tracking (if this game is part of a tournament)
  tournamentId?: number;
  matchId?: number;
};

const PONG_FRAME_INTERVAL_MS = 16; // ~60 FPS for maximum smoothness (localhost optimized)
const GAME_CLEANUP_DELAY_MS = 30000; // Clean up game 30 seconds after it ends
const INPUT_HISTORY_MAX_AGE_MS = 500; // Keep inputs for 500ms for lag compensation
const DEFAULT_RTT_MS = 50; // Default assumed RTT

// DEBUG: Key mappings for manual powerup triggering (for testing)
const DEBUG_SPAWN_KEYS: Record<string, PowerupType> = {
  '1': PowerupType.ADD_BALL,
  '2': PowerupType.INCREASE_BALL_SIZE,
  '3': PowerupType.DECREASE_BALL_SIZE,
};
const DEBUG_INSTANT_KEYS: Record<string, PowerupType> = {
  '4': PowerupType.INCREASE_PADDLE_SPEED,
  '5': PowerupType.DECREASE_PADDLE_SPEED,
  '6': PowerupType.SUPER_SPEED,
  '7': PowerupType.REVERSE_CONTROLS,
};
// Track previous debug key state per user (for edge detection)
const lastDebugKeys = new Map<number, Set<string>>();

// Callback type for tournament match completion
type TournamentMatchEndCallback = (tournamentId: number, matchId: number, winnerId: number) => Promise<void>;

export class PongManager {
  private static instance: PongManager | null = null;
  public games: Map<number, gameDataType>;
  private playerToGame: Map<number, number>; // userId -> gameId for O(1) lookup
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
      if (gameData.game.isGameOver()) {
        if (gameData.didGameEnd === false) {
          gameData.didGameEnd = true;
          
          // Send one final game state with gameOver: true to clients
          const finalGameState = gameData.game.fetchBoardJSON();
          finalGameState.serverTimestamp = now;
          this.hubSocket.sendMessage(user_url.ws.pong.getGameState, {
            recipients: Array.from(gameData.game.getUniquePlayerIds()),
            code: user_url.ws.pong.getGameState.schema.output.GameUpdate.code,
            payload: finalGameState,
          });
          
          this.onGameEnd(gameId, gameData);
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
    options: PongGameOptions,
    tournamentId?: number,
    matchId?: number
  ): Result<number, null> {
    let game = new PongGame(players, options);
    
    // Initialize input history and RTT tracking for each player
    const playerInputHistory = new Map<number, TimestampedInput[]>();
    const playerRTT = new Map<number, number>();
    for (const playerId of players) {
      playerInputHistory.set(playerId, []);
      playerRTT.set(playerId, DEFAULT_RTT_MS);
    }
    
    const gameData: gameDataType = {
      disconnected_players: [],
      ready_players: [],
      game: game,
      last_frame_time: Date.now(),
      didGameEnd: false,
      playerInputHistory,
      playerRTT,
    };
    
    // Only set tournament info if provided
    if (tournamentId !== undefined) {
      gameData.tournamentId = tournamentId;
    }
    if (matchId !== undefined) {
      gameData.matchId = matchId;
    }
    
    this.games.set(game.id, gameData);

    // Check if this is a local 1v1 mode (has guest player with ID -999)
    const GUEST_PLAYER_ID = -999;
    const isLocal1v1 = players.includes(GUEST_PLAYER_ID);

    // Register players for O(1) lookup
    for (const playerId of players) {
      this.playerToGame.set(playerId, game.id);
      for (const paddle of game.getPlayerPaddles(playerId)) {
        if (isLocal1v1) {
          // Local 1v1: Clear default keys, Host uses WASD, Guest uses arrows
          paddle.clearKeys();
          if (playerId === GUEST_PLAYER_ID) {
            paddle.addLeftKey("arrowleft");
            paddle.addRightKey("arrowright");
          } else {
            paddle.addLeftKey("a");
            paddle.addRightKey("d");
          }
        } else {
          // Normal mode: all keys for all players
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

    // For local 1v1 mode: the host also controls the guest's paddle with arrow keys
    const GUEST_PLAYER_ID = -999;
    const players = game.getPlayers();
    const isLocal1v1 = players.includes(GUEST_PLAYER_ID);
    if (isLocal1v1 && userId !== GUEST_PLAYER_ID) {
      // Host is sending input - forward arrow keys to guest's paddle
      const arrowKeys = parsedKeys.filter(k => k === "arrowleft" || k === "arrowright");
      game.handlePressedKeysForPlayer(arrowKeys, GUEST_PLAYER_ID);
    }

    // DEBUG: Handle manual powerup trigger keys
    const prevDebugKeys = lastDebugKeys.get(userId) || new Set<string>();
    const currDebugKeys = new Set(parsedKeys.filter(k => k in DEBUG_SPAWN_KEYS || k in DEBUG_INSTANT_KEYS));
    
    // Only trigger effects for NEWLY pressed debug keys
    for (const key of currDebugKeys) {
      if (!prevDebugKeys.has(key)) {
        if (key in DEBUG_SPAWN_KEYS) {
          game.debugSpawnPowerup(DEBUG_SPAWN_KEYS[key]!);
        } else if (key in DEBUG_INSTANT_KEYS) {
          game.debugApplyPowerupEffect(DEBUG_INSTANT_KEYS[key]!);
        }
      }
    }
    lastDebugKeys.set(userId, currDebugKeys);
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

  public async onGameEnd(gameId: number, gameData: gameDataType): Promise<void> {
    const game = gameData.game;
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

    // If this was a tournament match, record the winner
    const winnerId = game.getWinner();
    if (gameData.tournamentId !== undefined && gameData.matchId !== undefined && winnerId !== null) {
      console.log(`[PongManager] Tournament match ended. Tournament: ${gameData.tournamentId}, Match: ${gameData.matchId}, Winner: ${winnerId}`);
      // Emit event for tournament manager to handle
      // This will be handled by the tournament callback if set
      if (this.tournamentMatchEndCallback) {
        try {
          await this.tournamentMatchEndCallback(gameData.tournamentId, gameData.matchId, winnerId);
        } catch (err) {
          console.error("Failed to record tournament match winner:", err);
        }
      }
    }

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
