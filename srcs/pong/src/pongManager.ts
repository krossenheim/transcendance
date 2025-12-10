import { int_url, user_url } from "@app/shared/api/service/common/endpoints";
import { Result } from "@app/shared/api/service/common/result";
import { PongGame, PongGameOptions } from "./game/game";
import { OurSocket } from "@app/shared/socket_to_hub";
import containers from "@app/shared/internal_api";

type gameDataType = {
  disconnected_players: number[];
  last_frame_time: number;
  ready_players: number[];
  game: PongGame;
  didGameEnd: boolean;
};

// Simulation and broadcast timing
// Run the physics simulation at a stable fixed timestep (60 Hz)
const PONG_SIM_MS = 1000 / 60; // ~16.6667 ms (60 FPS)
// Broadcast (send game state to clients) at a lower rate to reduce network jitter
const PONG_BROADCAST_MS = 1000 / 60; // ~16.6667 ms (60 FPS)

export class PongManager {
  private static instance: PongManager | null = null;
  public games: Map<number, gameDataType>;

  private hubSocket: OurSocket;

  constructor(hubSocket: OurSocket) {
    this.games = new Map();
    this.hubSocket = hubSocket;
    if (PongManager.instance !== null) {
      return PongManager.instance;
    }
    PongManager.instance = this;

    // Start the main loop: fixed-timestep simulation + separate broadcast cadence
    this._loopRunning = true;
    this._lastLoopTime = Date.now();
    this._broadcastAccumulator = 0;
    this.loopTick();
    return this;
  }

  // Internal loop state
  private _loopRunning: boolean = false;
  private _lastLoopTime: number = 0;
  private _broadcastAccumulator: number = 0;

  private loopTick() {
    if (!this._loopRunning) return;
    const now = Date.now();
    let elapsed = now - this._lastLoopTime;
    // Protect against huge elapsed times (e.g., if the process was suspended)
    if (elapsed > 1000) elapsed = PONG_SIM_MS;
    this._lastLoopTime = now;

    // Accumulate elapsed time for simulation; run fixed-step updates
    let simSteps = Math.max(1, Math.floor(elapsed / PONG_SIM_MS));
    // Cap steps to avoid spiraling in pathological cases
    if (simSteps > 8) simSteps = 8;

    for (const gameData of this.games.values()) {
      if (gameData.game.isGameOver()) {
        if (gameData.didGameEnd === false) {
          gameData.didGameEnd = true;
          this.onGameEnd(gameData.game);
        }
        continue;
      }

      for (let s = 0; s < simSteps; s++) {
        gameData.game.playSimulation(PONG_SIM_MS / 1000.0);
      }
    }

    // Broadcast at a lower cadence
    this._broadcastAccumulator += elapsed;
    if (this._broadcastAccumulator >= PONG_BROADCAST_MS) {
      this._broadcastAccumulator = 0;
      for (const gameData of this.games.values()) {
        if (gameData.game.isGameOver()) continue;
        this.hubSocket.sendMessage(user_url.ws.pong.getGameState, {
          recipients: Array.from(gameData.game.getUniquePlayerIds()),
          code: user_url.ws.pong.getGameState.schema.output.GameUpdate.code,
          payload: gameData.game.fetchBoardJSON(),
        });
      }
    }

    // Schedule next tick attempting to compensate for drift
    const tickDuration = Date.now() - now;
    const delay = Math.max(0, PONG_SIM_MS - tickDuration);
    setTimeout(() => this.loopTick(), delay);
  }

  public startGame(
    players: number[],
    options: PongGameOptions
  ): Result<number, null> {
    let game = new PongGame(players, options);
    this.games.set(game.id, {
      disconnected_players: [],
      ready_players: [],
      game: game,
      last_frame_time: Date.now(),
      didGameEnd: false,
    });

    for (const playerId of players) {
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
    keys: string[]
  ) {
    for (const gameData of this.games.values()) {
      const game = gameData.game;
      const parsedKeys = Array.from(new Set(keys.map((key) => key.toLowerCase())));
      if (game.getPlayers().includes(userId)) {
        try {
          console.debug(`[Pong] handleUserInput user=${userId} parsedKeys=`, parsedKeys)
          // Show which paddle keyData entries exist for this user's paddles
          const paddles = game.getPlayerPaddles(userId)
          for (const p of paddles) {
            console.debug(`[Pong] paddle ${p.playerId} keyData=`, p.keyData.map(k => ({ key: k.key, isClockwise: k.isClockwise })))
          }
        } catch (e) {
          console.warn("[Pong] Failed to log paddle keyData for debugging", e)
        }
        game.handlePressedKeys(parsedKeys);
      }
    }
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
    for (const gameData of this.games.values()) {
      const game = gameData.game;
      if (game.getPlayers().includes(userId)) {
        if (!gameData.disconnected_players.includes(userId)) {
          gameData.disconnected_players.push(userId);
        }
        gameData.game.removePlayer(userId);
      }
    }
  }

  public async onGameEnd(game: PongGame): Promise<void> {
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
  }
}

// export default { PongManager };
