import { user_url } from "@app/shared/api/service/common/endpoints";
import { Result } from "@app/shared/api/service/common/result";
import { PongGame, PongGameOptions } from "./game/game";
import { OurSocket } from "@app/shared/socket_to_hub";

type gameDataType = {
  disconnected_players: number[];
  last_frame_time: number;
  ready_players: number[];
  game: PongGame;
};

const PONG_FRAME_INTERVAL_MS = 16; // Approx 60 FPS

export class PongManager {
  public games: Map<number, gameDataType>;
  public static instance: PongManager;

  private hubSocket: OurSocket;

  constructor(hubSocket: OurSocket) {
    this.games = new Map();
    this.hubSocket = hubSocket;
    if (PongManager.instance) {
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
      const deltaTime = (now - gameData.last_frame_time) / 1000.0;
      gameData.game.playSimulation(deltaTime);
      gameData.last_frame_time = now;
      for (const playerId of gameData.game.getUniquePlayerIds()) {
        console.log(`Sending game state to player ${playerId}`);
        this.hubSocket.sendMessage(user_url.ws.pong.getGameState, {
          recipients: gameData.game.getPlayers(),
          code: user_url.ws.pong.getGameState.schema.output.GameUpdate.code,
          payload: gameData.game.fetchBoardJSON(),
        });
      }
    }
  }

  startGame(
    players: number[],
    options: PongGameOptions
  ): Result<number, null> {
    let game = new PongGame(players, options);
    this.games.set(game.id, {
      disconnected_players: [],
      ready_players: [],
      game: game,
      last_frame_time: Date.now(),
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

  handleUserInput(
    userId: number,
    keys: string[]
  ) {
    for (const gameData of this.games.values()) {
      const game = gameData.game;
      const parsedKeys = Array.from(new Set(keys.map((key) => key.toLowerCase())));
      if (game.getPlayers().includes(userId)) {
        game.handlePressedKeys(parsedKeys);
      }
    }
  }

  getGameState(
    userId: number,
    gameId: number
  ): Result<any, string> {
    const gameData = this.games.get(gameId);
    if (gameData === undefined || !gameData.game.getPlayers().includes(userId))
        return Result.Err("Game not found");
    return Result.Ok(gameData.game.fetchBoardJSON());
  }
}

export default PongManager;
