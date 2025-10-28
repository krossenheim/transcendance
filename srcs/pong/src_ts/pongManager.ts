import PongGame from "./pongGame.js";
import { Result } from "./utils/api/service/common/result.js";
import type { ErrorResponseType } from "./utils/api/service/common/error.js";
import { user_url } from "./utils/api/service/common/endpoints.js";
import type { WSHandlerReturnValue } from "utils/socket_to_hub.js";

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

  // playerJoinInstance(client_request: T_ForwardToContainer): T_PayloadToUsers {
  //   const validrequest = ForwardToContainerSchema.safeParse(client_request);
  //   if (!validrequest.success) {
  //     console.error(
  //       "exact fields expected at this stage: :",
  //       validrequest.error
  //     );
  //     throw Error("Data should be clean at this stage.");
  //   }
  //   const { game_id } = validrequest.data.payload;
  //   const { user_id } = validrequest.data;
  //   const gameInstance: PongGame | undefined = this.pong_instances.get(game_id);
  //   if (!gameInstance) {
  //     return {
  //       recipients: [user_id],
  //       funcId: "join_instance",
  //       payload: {
  //         status: httpStatus.UNPROCESSABLE_ENTITY,
  //         game_id: game_id,
  //         pop_up_text: "No game with given, or not in the list of players.",
  //       },
  //     };
  //   }
  // playerJoinInstance(client_request: T_ForwardToContainer): T_PayloadToUsers {
  //   const validrequest = ForwardToContainerSchema.safeParse(client_request);
  //   if (!validrequest.success) {
  //     console.error(
  //       "exact fields expected at this stage: :",
  //       validrequest.error
  //     );
  //     throw Error("Data should be clean at this stage.");
  //   }
  //   const { game_id } = validrequest.data.payload;
  //   const { user_id } = validrequest.data;
  //   const gameInstance: PongGame | undefined = this.pong_instances.get(game_id);
  //   if (!gameInstance) {
  //     return {
  //       recipients: [user_id],
  //       funcId: "join_instance",
  //       payload: {
  //         status: httpStatus.UNPROCESSABLE_ENTITY,
  //         game_id: game_id,
  //         pop_up_text: "No game with given, or not in the list of players.",
  //       },
  //     };
  //   }

  //   // debug
  //   // debug
  //   this.pong_instances = new Map();
  //   this.pong_instances.set(game_id, gameInstance);
  //   // for (const [id, instance] of this.pong_instances) {
  //   //   if (instance !== gameInstance) {
  //   //     this.pong_instances.delete(id);
  //   //   }
  //   // }
  //   // debug
  //   // debug

  //   return {
  //     recipients: [user_id],
  //     funcId: "join_instance",

  //     payload: {
  //       status: httpStatus.BAD_REQUEST,
  //       func_name: process.env.FUNC_POPUP_TEXT,
  //       pop_up_text: "Could not start pong game.",
  //     },
  //   };
  // }
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
      return {
        recipients: [user_id],
        code: user_url.ws.pong.startGame.schema.output.FailedCreateGame.code,
        payload: {
          message: "Could not start pong game: failed to create game instance.",
        },
      };
    }
    const pong_game = result.unwrap();
    const game_id = this.debugGameID;
    this.debugGameID++;
    this.pong_instances.clear(); //debug debug debug
    this.pong_instances.set(game_id, pong_game);
    // Send the users the game id.
    {
      return {
        recipients: player_list,
        code: user_url.ws.pong.startGame.schema.output.GameInstanceCreated.code,
        payload: {
          board_id: game_id,
          player_list: player_list,
        },
      };
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
}

export default PongManager;
