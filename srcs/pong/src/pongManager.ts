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

const PONG_FRAME_INTERVAL_MS = 50; // Approx 20 FPS
const GAME_CLEANUP_DELAY_MS = 30000; // Clean up game 30 seconds after it ends

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
      this.hubSocket.sendMessage(user_url.ws.pong.getGameState, {
        recipients: Array.from(gameData.game.getUniquePlayerIds()),
        code: user_url.ws.pong.getGameState.schema.output.GameUpdate.code,
        payload: gameData.game.fetchBoardJSON(),
      });
    }
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
    keys: string[]
  ) {
    // O(1) lookup instead of iterating all games
    const gameId = this.playerToGame.get(userId);
    if (gameId === undefined) return;
    
    const gameData = this.games.get(gameId);
    if (!gameData || gameData.didGameEnd) return;

    const game = gameData.game;
    const parsedKeys = Array.from(new Set(keys.map((key) => key.toLowerCase())));
    
    // Only set keys for this specific user's paddles
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
