import PongGame from "./pongGame.js";
import { formatZodError } from "./utils/formatZodError.js";
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
} from "./utils/api/service/pong/pong_interfaces.js";

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

  playerJoinInstance(client_request: T_ForwardToContainer): T_PayloadToUsers {
    const validrequest = ForwardToContainerSchema.safeParse(client_request);
    if (!validrequest.success) {
      console.error(
        "exact fields expected at this stage: :",
        validrequest.error
      );
      throw Error("Data should be clean at this stage.");
    }
    const { game_id } = validrequest.data.payload;
    const { user_id } = validrequest.data;
    const gameInstance: PongGame | undefined = this.pong_instances.get(game_id);
    if (!gameInstance) {
      return {
        recipients: [user_id],
        funcId: "join_instance",
        payload: {
          status: httpStatus.UNPROCESSABLE_ENTITY,
          game_id: game_id,
          pop_up_text: "No game with given, or not in the list of players.",
        },
      };
    }

    // debug
    // debug
    for (const [id, instance] of this.pong_instances) {
      if (instance !== gameInstance) {
        this.pong_instances.delete(id);
      }
    }
    // debug
    // debug

    return {
      recipients: [user_id],
      funcId: "join_instance",
      payload: {
        status: httpStatus.BAD_REQUEST,
        func_name: process.env.FUNC_POPUP_TEXT,
        pop_up_text: "Could not start pong game.",
      },
    };
  }
  startGame(client_request: T_ForwardToContainer): T_PayloadToUsers {
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
      return formatZodError([user_id], valid_gamestart.error);
    }

    const zodded = StartNewPongGameSchema.safeParse(validation.data.payload);
    if (!zodded.success) {
      console.log("Invalid payload to start a game.: " + zodded.error);
      return {
        recipients: [user_id],
        funcId: "start_pong",
        payload: {
          status: httpStatus.BAD_REQUEST,
          func_name: process.env.FUNC_POPUP_TEXT,
          pop_up_text: "could not start pong game.",
        },
      };
    }
    const { player_list } = validation.data.payload;
    // const { user_id } = parsed;
    const pong_game = PongGame.create(player_list);
    if (!pong_game) {
      return {
        recipients: [user_id],
        funcId: "start_pong",
        payload: {
          status: httpStatus.BAD_REQUEST,
          func_name: process.env.FUNC_POPUP_TEXT,
          pop_up_text: "could not start pong game.",
        },
      };
    }

    const game_id = this.debugGameID;
    this.debugGameID++;
    this.pong_instances.clear(); //debug debug debug
    this.pong_instances.set(game_id, pong_game);
    // Send the users the game id.
    {
      return {
        recipients: [user_id],
        funcId: "start_pong",
        payload: {
          status: httpStatus.OK,
          func_name: process.env.FUNC_POPUP_TEXT,
          pop_up_text: "Your pong game_id is: " + game_id,
        },
      };
    }
  }

  movePaddle(input: T_ForwardToContainer) {
    const { user_id, payload } = input;
    if (!user_id) {
      throw Error("No userid field.");
    }
    const validate_input = MovePaddlePayloadScheme.safeParse(payload);
    if (!validate_input.success) {
      // 0 or null or 1
      console.log(validate_input.error);
      return;
    }
    const board_id = validate_input.data.b;
    if (!board_id) {
      console.error("Bad input, no board_id member.");
      return;
    }
    for (const [id, game] of this.pong_instances) {
      if (id !== board_id) {
        continue;
      }
      if (!game.players.includes(user_id)) {
        console.log(
          "User with id ",
          user_id,
          " not a player of game with id ",
          id,
          " Its players are: ",
          game.players
        );
        return;
      }
      game.setInputOnPaddle(user_id, validate_input.data.m);
    }
  }
}

export default PongManager;
