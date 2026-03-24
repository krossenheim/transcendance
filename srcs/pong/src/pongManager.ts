import { int_url, user_url } from "@app/shared/api/service/common/endpoints";
import { Result } from "@app/shared/api/service/common/result";
import { PongGame, PongGameOptions } from "./game/game";
import { OurSocket } from "@app/shared/socket_to_hub";
import containers from "@app/shared/internal_api";
import { AIManager, AIDifficulty } from "./aiController";

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
  // Spectators watching this game
  spectators: number[];
  // AI player management
  aiManager: AIManager;
  // Player usernames for leaderboard display
  playerUsernames: { [key: number]: string };
  // Local match: the authenticated host controlling both paddles
  localHostUserId?: number;
};

const PONG_FRAME_INTERVAL_MS = 16; // ~60 FPS for maximum smoothness (localhost optimized)
const GAME_CLEANUP_DELAY_MS = 30000; // Clean up game 30 seconds after it ends
const INPUT_HISTORY_MAX_AGE_MS = 500; // Keep inputs for 500ms for lag compensation
const DEFAULT_RTT_MS = 50; // Default assumed RTT



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
      // Check game-over AFTER simulation so the final frame still runs
      // (prevents AI paddles from freezing on the frame a player is eliminated)
      if (gameData.didGameEnd) {
        continue;
      }

      const deltaTime = (now - gameData.last_frame_time) / 1000.0;
      
      // Process AI inputs before simulation
      if (gameData.aiManager.count > 0) {
        const currentGameState = gameData.game.fetchBoardJSON();
        gameData.aiManager.refreshGameStates(currentGameState);
        // Temporarily boost AI paddle speeds based on difficulty
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
        
        // Restore AI paddle speeds after simulation
        for (const [aiPlayerId, originalSpeed] of aiSpeedBackups) {
          const paddles = gameData.game.getPlayerPaddles(aiPlayerId);
          for (const paddle of paddles) {
            paddle.setSpeedUnclamped(originalSpeed);
          }
        }
      } else {
        gameData.game.playSimulation(deltaTime);
      }
      gameData.last_frame_time = now;
      
      // Fetch game state and add server timestamp for client-side lag compensation
      const gameState = gameData.game.fetchBoardJSON();
      gameState.serverTimestamp = now;  // Add server timestamp
      // Include player usernames and tournament info for leaderboard/UI
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

      // Handle game-over after simulation and broadcast, so clients get the final state
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
    aiDifficulty: AIDifficulty = AIDifficulty.HARD
  ): Result<number, null> {
    let game = new PongGame(players, options);
    
    // Initialize input history and RTT tracking for each player
    const playerInputHistory = new Map<number, TimestampedInput[]>();
    const playerRTT = new Map<number, number>();
    for (const playerId of players) {
      playerInputHistory.set(playerId, []);
      playerRTT.set(playerId, DEFAULT_RTT_MS);
    }
    
    // Initialize AI manager
    const aiManager = new AIManager();
    for (const aiId of aiPlayerIds) {
      aiManager.addAI(aiId, aiDifficulty);
    }
    
    if (aiPlayerIds.length > 0) {
    }
    
    // Build complete playerUsernames including AI players
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
    // Check if this is a local tournament match (localHostUserId is set)
    const isLocalMatch = isLocal1v1 || (localHostUserId !== undefined);

    // Store local host info for input routing
    if (localHostUserId !== undefined) {
      gameData.localHostUserId = localHostUserId;
      // Register the host in playerToGame so input routing works
      this.playerToGame.set(localHostUserId, game.id);
      // Add host as spectator so they receive game state broadcasts
      if (!players.includes(localHostUserId)) {
        gameData.spectators.push(localHostUserId);
      }
    }

    // Register players for O(1) lookup
    for (const playerId of players) {
      this.playerToGame.set(playerId, game.id);
      const isAI = aiPlayerIds.includes(playerId);
      for (const paddle of game.getPlayerPaddles(playerId)) {
        if (isAI) {
          // AI players always use arrowleft/arrowright (what the AI controller emits)
          paddle.clearKeys();
          paddle.addLeftKey("arrowleft");
          paddle.addRightKey("arrowright");
        } else if (isLocalMatch) {
          // Local match (1v1 or tournament): Clear default keys
          // First human player uses WASD (a/d), second human player uses arrows
          paddle.clearKeys();
          if (playerId === players[1]) {
            // Second player: arrows
            paddle.addLeftKey("arrowleft");
            paddle.addRightKey("arrowright");
          } else if (playerId === players[0]) {
            // First player: WASD
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

    // For local match modes: route the host's keys to both players
    const GUEST_PLAYER_ID = -999;
    const players = game.getPlayers();
    const isLocal1v1 = players.includes(GUEST_PLAYER_ID);

    // Local tournament match: host controls both paddles
    if (gameData.localHostUserId === userId && !isLocal1v1) {
      // Route WASD keys to player 1 (first player in the match)
      const wasdKeys = parsedKeys.filter(k => k === "a" || k === "d");
      if (players[0] !== undefined) {
        game.handlePressedKeysForPlayer(wasdKeys, players[0]);
      }
      // Route arrow keys to player 2 (second player in the match)
      const arrowKeys = parsedKeys.filter(k => k === "arrowleft" || k === "arrowright");
      if (players[1] !== undefined) {
        game.handlePressedKeysForPlayer(arrowKeys, players[1]);
      }
    } else if (isLocal1v1 && userId !== GUEST_PLAYER_ID) {
      // Host is sending input - forward arrow keys to guest's paddle
      const arrowKeys = parsedKeys.filter(k => k === "arrowleft" || k === "arrowright");
      game.handlePressedKeysForPlayer(arrowKeys, GUEST_PLAYER_ID);
    }
  }

  /**
   * Add a spectator to watch a game.
   * Returns the current game state if successful.
   */
  public addSpectator(
    userId: number,
    gameId: number
  ): Result<any, string> {
    const gameData = this.games.get(gameId);
    if (gameData === undefined) {
      return Result.Err("Game not found");
    }
    
    // Don't add if already a player
    if (gameData.game.getPlayers().includes(userId)) {
      return Result.Err("You are a player in this game");
    }
    
    // Don't add if game is already over
    if (gameData.didGameEnd) {
      return Result.Err("Game has already ended");
    }
    
    // Add to spectators if not already
    if (!gameData.spectators.includes(userId)) {
      gameData.spectators.push(userId);
    }
    
    // Return current game state
    const gameState = gameData.game.fetchBoardJSON();
    gameState.serverTimestamp = Date.now();
    gameState.isSpectator = true;
    return Result.Ok(gameState);
  }

  /**
   * Remove a spectator from a game.
   */
  public removeSpectator(userId: number, gameId: number): void {
    const gameData = this.games.get(gameId);
    if (gameData) {
      gameData.spectators = gameData.spectators.filter(id => id !== userId);
    }
  }

  /**
   * Get game ID by tournament match ID for spectating.
   */
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
    
    // Allow both players (including eliminated) and spectators
    const isPlayer = gameData.game.getAllPlayerIds().has(userId);
    const isSpectator = gameData.spectators.includes(userId);
    
    if (!isPlayer && !isSpectator) {
      return Result.Err("Game not found");
    }
    
    const gameState = gameData.game.fetchBoardJSON();
    gameState.isSpectator = isSpectator;
    // Include player usernames for leaderboard display
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

    const storageResult = await containers.db.post(int_url.http.db.storePongGameResults, rankings.map(([playerId, score, rank]) => ({
      gameId: game.id,
      userId: playerId as number,
      score: score as number,
      rank: rank as number,
    })), undefined, undefined);
    if (storageResult.isErr()) {
      console.error("Failed to store game results:", storageResult.unwrapErr());
    } else {
    }

    // If this was a tournament match, record the winner
    const winnerId = game.getWinner();
    if (gameData.tournamentId !== undefined && gameData.matchId !== undefined && winnerId !== null) {
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
      // Remove player-to-game mappings — only if they still point to THIS game
      // (a new game may have already overwritten the mapping)
      for (const playerId of gameData.game.getAllPlayerIds()) {
        if (this.playerToGame.get(playerId) === gameId) {
          this.playerToGame.delete(playerId);
        }
      }
      // Also clean up localHostUserId mapping for local tournament matches
      if (gameData.localHostUserId !== undefined && this.playerToGame.get(gameData.localHostUserId) === gameId) {
        this.playerToGame.delete(gameData.localHostUserId);
      }
      this.games.delete(gameId);
    }
  }
}

// export default { PongManager };
