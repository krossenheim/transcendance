import PongGame from "./pongGame.js";
import { Result } from "./utils/api/service/common/result.js";
import type { ErrorResponseType } from "./utils/api/service/common/error.js";
import { user_url } from "./utils/api/service/common/endpoints.js";
import type { WSHandlerReturnValue } from "./utils/socket_to_hub.js";
import { PongLobbyStatus } from "./playerPaddle.js";

export class PongManager {
  public pong_instances: Map<number, PongGame>;
  public static instance: PongManager;
  public debugGameID: number;
  constructor() {
    this.debugGameID = 1;
    this.pong_instances = new Map();
    if (PongManager.instance) {
      return PongManager.instance;
    }
    PongManager.instance = this;
    return this;
  }

  setPlayerStatus(user_id: number, status: PongLobbyStatus) {
    for (const [game_id, game] of this.pong_instances) {
      for (const paddle of game.player_paddles) {
        if (paddle.player_ID === user_id) {
          paddle.connectionStatus = status;
        }
      }
    }
  }

  userReportsReady(
    user_id: number,
    gameIdReq: number
  ): Result<
    WSHandlerReturnValue<
      typeof user_url.ws.pong.userReportsReady.schema.output
    >,
    ErrorResponseType
  > {
    const game: undefined | PongGame = this.pong_instances.get(gameIdReq);
    if (game === undefined || !game.player_ids.find((id) => id === user_id)) {
      console.warn(`User ${user_id} not in game`);
      return Result.Ok({
        recipients: [user_id],
        code: user_url.ws.pong.userReportsReady.schema.output.FailedToReady
          .code,
        payload: {
          message: `No game by ID ${gameIdReq}" exists, or you are not in it.`,
        },
      });
    }
    for (const paddle of game.player_paddles) {
      // Case two paddles 1 player.
      if (paddle.player_ID !== user_id) continue;
      if (paddle.connectionStatus === PongLobbyStatus.Ready) {
        paddle.connectionStatus = PongLobbyStatus.Paused;
      } else {
        if (paddle.connectionStatus === PongLobbyStatus.NotConnected) {
          console.warn("    'JoinGame' first?");
        }
        paddle.connectionStatus = PongLobbyStatus.Ready;
      }
    }
    // Send the player a snap of the game
    return Result.Ok({
      recipients: game.player_ids,
      code: user_url.ws.pong.userReportsReady.schema.output.UserIsReady.code,
      payload: {
        game_id: gameIdReq,
        user_id: user_id,
      },
    });
  }
  startGame(
    user_id: number,
    player_list: number[],
    ball_count: number
  ): Result<
    WSHandlerReturnValue<
      typeof user_url.ws.pong.startGame.schema.output
    > | null,
    ErrorResponseType
  > {
    // const { user_id } = parsed;
    let result = PongGame.create(ball_count, player_list);
    if (result.isErr()) {
      return Result.Ok({
        recipients: [user_id],
        code: user_url.ws.pong.startGame.schema.output.FailedCreateGame.code,
        payload: {
          message: "Could not start pong game: failed to create game instance.",
        },
      });
    }
    const pong_game = result.unwrap();
    const game_id = this.debugGameID;
    this.debugGameID++;
    this.pong_instances.clear(); //debug debug debug
    this.pong_instances.set(game_id, pong_game);
    // Send the users the game id.
    {
      return Result.Ok({
        recipients: player_list,
        code: user_url.ws.pong.startGame.schema.output.GameInstanceCreated.code,
        payload: {
          board_id: game_id,
          player_list: player_list,
        },
      });
    }
  }

  movePaddle(
    game_id: number,
    paddle_id: number,
    user_id: number,
    m: boolean | null // left or right movement. | stop movement.
  ): Result<
    WSHandlerReturnValue<
      typeof user_url.ws.pong.movePaddle.schema.output
    > | null,
    ErrorResponseType
  > {
    const game = this.pong_instances.get(game_id);
    if (!game || !game.player_ids.find((id) => id === user_id)) {
      return Result.Ok({
        recipients: [user_id],
        funcId: user_url.ws.pong.movePaddle.funcId,
        code: user_url.ws.pong.movePaddle.schema.output.NotInRoom.code,
        payload: {
          message: "You're not in game with ID " + game_id,
        },
      });
    }
    const paddle = game.player_paddles.find((p) => p.pad_id === paddle_id);
    if (!paddle) {
      return Result.Ok({
        recipients: [user_id],
        funcId: user_url.ws.pong.movePaddle.funcId,
        code: user_url.ws.pong.movePaddle.schema.output.NoSuchPaddle.code,
        payload: {
          message: `No paddle with ID ${paddle_id} in game (ID ${game_id})`,
        },
      });
    }
    if (paddle.player_ID !== user_id) {
      return Result.Ok({
        recipients: [user_id],
        funcId: user_url.ws.pong.movePaddle.funcId,
        code: user_url.ws.pong.movePaddle.schema.output.NotYourPaddle.code,
        payload: {
          message: `Player with ID ${paddle.player_ID} is using paddle (ID ${paddle.pad_id}).`,
        },
      });
    }
    paddle.setMoveOnNextFrame(m);
    return Result.Ok(null);
  }

  getGamesWithPlayerById(playerId: number): PongGame[] {
    return [...this.pong_instances.values()].filter((g) =>
      g.player_paddles.find((n) => n.player_ID === playerId)
    );
  }
}

export default PongManager;
