import PongGame from "./pongGame.js";
import {
  ForwardToContainerSchema,
  PayloadToUsersSchema,
} from "./utils/api/service/hub/hub_interfaces.js";
import { httpStatus } from "./utils/httpStatusEnum.js";
import { z } from "zod";
import {
  MovePaddlePayloadScheme,
  PongBallSchema,
  PongPaddleSchema,
  StartNewPongGameSchema,
  type TypeMovePaddlePayloadScheme,
} from "./utils/api/service/pong/pong_interfaces.js";
import { Result } from "./utils/api/service/common/result.js";
import type { ErrorResponseType } from "./utils/api/service/common/error.js";
import { user_url } from "./utils/api/service/common/endpoints.js";
import type { WSHandlerReturnValue } from "utils/socket_to_hub.js";

const payload_MOVE_RIGHT = 1;
const payload_MOVE_LEFT = 0;
const PLAYER_NO_INPUT = undefined;

type T_ForwardToContainer = z.infer<typeof ForwardToContainerSchema>;
type T_PayloadToUsers = z.infer<typeof PayloadToUsersSchema>;

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
  startGame(client_request: T_ForwardToContainer): WSHandlerReturnValue<typeof user_url.ws.pong.startGame.schema.responses> {
    const validation = ForwardToContainerSchema.safeParse(client_request);
    if (!validation.success) {
      console.error("exact fields expected at this stage: :", validation.error);
      throw Error("Data should be clean at this stage.");
    }
    const { user_id } = client_request;
    const valid_gamestart = StartNewPongGameSchema.safeParse(
      client_request.payload
    );
    if (!valid_gamestart.success) {
      return {
        recipients: [user_id],
        code: user_url.ws.pong.startGame.schema.responses.InvalidInput.code,
        payload: {
          message: "Could not start pong game: ",
        },
      };
    }

    const zodded = StartNewPongGameSchema.safeParse(validation.data.payload);
    if (!zodded.success) {
      console.log("Invalid payload to start a game.: " + zodded.error);
      return {
        recipients: [user_id],
        code: user_url.ws.pong.startGame.schema.responses.InvalidInput.code,
        payload: {
          message: "Could not start pong game: invalid payload structure.",
        },
      };
    }
    const { player_list } = validation.data.payload;
    // const { user_id } = parsed;
    let result = PongGame.create(player_list);
    if (result.isErr()) {
      return {
        recipients: [user_id],
        code: user_url.ws.pong.startGame.schema.responses.FailedCreateGame.code,
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
        recipients: [user_id],
        code: user_url.ws.pong.startGame.schema.responses.GameInstanceCreated.code,
        // payload: {
        //   game_id: game_id,
        //   player_list: player_list,
        // },
        payload: {}
      };
    }
  }

  movePaddle(
    client_metadata: T_ForwardToContainer
  ): Result<WSHandlerReturnValue<typeof user_url.ws.pong.movePaddle.schema.responses> | null, ErrorResponseType> {
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
