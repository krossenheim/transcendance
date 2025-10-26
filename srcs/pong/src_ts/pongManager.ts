import PongGame from "./pongGame.js";
import {
  ForwardToContainerSchema,
  PayloadToUsersSchema,
} from "./utils/api/service/hub/hub_interfaces.js";
import { z } from "zod";
import { Result } from "./utils/api/service/common/result.js";
import type { ErrorResponseType } from "./utils/api/service/common/error.js";
import { user_url } from "./utils/api/service/common/endpoints.js";
import type { WSHandlerReturnValue } from "./utils/socket_to_hub.js";
import { PongLobbyStatus } from "./playerPaddle.js";

const payload_MOVE_RIGHT = 1;
const payload_MOVE_LEFT = 0;
const PLAYER_NO_INPUT = undefined;

type T_ForwardToContainer = z.infer<typeof ForwardToContainerSchema>;

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
  userReportsReady(
    client_request: T_ForwardToContainer
  ): Result<
    WSHandlerReturnValue<
      typeof user_url.ws.pong.userReportsReady.schema.responses
    >,
    ErrorResponseType
  > {
    const { game_id } = client_request.payload;
    const game: undefined | PongGame = this.pong_instances.get(game_id);
    if (
      game === undefined ||
      !game.player_ids.find((id) => id === client_request.user_id)
    ) {
      console.warn(`User ${client_request.user_id} not in game`);
      return Result.Ok({
        recipients: [client_request.user_id],
        code: user_url.ws.pong.userReportsReady.schema.responses.FailedToReady
          .code,
        payload: {
          message: `No game by ID ${game_id}" exists, or you are not in it.`,
        },
      });
    }
    const playerPaddle = game.player_id_to_paddle.get(client_request.user_id);
    if (undefined === playerPaddle) {
      console.error(
        "This should never happen, as the user id is in game.player_ids"
      );
      return Result.Err({ message: "Very weird exception" });
    }
    let newStatus: number = -1;
    if (playerPaddle.connectionStatus === PongLobbyStatus.Ready) {
      newStatus = PongLobbyStatus.Paused;
    } else {
      if (playerPaddle.connectionStatus === PongLobbyStatus.NotConnected) {
        console.warn(
          "User has readied for a game that thinks they aren't connected to. Add a 'JoinGame' function or leave like this?"
        );
      }
      newStatus = PongLobbyStatus.Ready;
    }
    for (const paddle of game.player_paddles) {
      // Case two paddles 1 player.
      if (paddle.player_ID === client_request.user_id)
        playerPaddle.connectionStatus = newStatus;
    }
    // Send the player a snap of the game
    return Result.Ok({
      recipients: game.player_ids,
      code: user_url.ws.pong.userReportsReady.schema.responses.UserIsReady.code,
      payload: {
        game_id: game_id,
        user_id: client_request.user_id,
      },
    });
  }

  startGame(
    client_request: T_ForwardToContainer
  ): Result<
    WSHandlerReturnValue<typeof user_url.ws.pong.startGame.schema.responses>,
    ErrorResponseType
  > {
    const { user_id } = client_request;
    const { balls, player_list } = client_request.payload;
    // const { user_id } = parsed;
    let result = PongGame.create(balls, player_list);
    if (result.isErr()) {
      return Result.Ok({
        recipients: [user_id],
        code: user_url.ws.pong.startGame.schema.responses.FailedCreateGame.code,
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
        recipients: [user_id],
        code: user_url.ws.pong.startGame.schema.responses.GameInstanceCreated
          .code,
        payload: {
          game_id: game_id,
          player_list: player_list,
        },
      });
    }
  }

  movePaddle(
    client_metadata: T_ForwardToContainer
  ): Result<
    WSHandlerReturnValue<
      typeof user_url.ws.pong.movePaddle.schema.responses
    > | null,
    ErrorResponseType
  > {
    const game = this.pong_instances.get(client_metadata.payload.board_id);
    if (
      !game ||
      !game.player_ids.find((id) => id === client_metadata.user_id)
    ) {
      return Result.Ok({
        recipients: [client_metadata.user_id],
        funcId: client_metadata.funcId,
        code: user_url.ws.pong.movePaddle.schema.responses.NotInRoom.code,
        payload: {
          message:
            "You're not in game with ID " + client_metadata.payload.board_id,
        },
      });
    }
    game.setInputOnPaddle(client_metadata.user_id, client_metadata.payload.m);
    return Result.Ok(null);
  }
}

export default PongManager;
