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
        // Only set keys for this specific user's paddles
        game.handlePressedKeysForPlayer(parsedKeys, userId);
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
