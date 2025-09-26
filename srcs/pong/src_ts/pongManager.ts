import PongGame from "./pongGame.js";
import { formatZodError } from "./utils/formatZodError.js";
import { StartNewPongGameSchema } from "./utils/api/service/pong/pong_interfaces.js";
import {
  ForwardToContainerSchema,
  PayloadToUsersSchema,
} from "./utils/api/service/hub/hub_interfaces.js";
import { httpStatus } from "./utils/httpStatusEnum.js";
import { z } from "zod";
const payload_MOVE_RIGHT = 1;
const payload_MOVE_LEFT = 0;
const PLAYER_NO_INPUT = undefined;

type T_ForwardToContainer = z.infer<typeof ForwardToContainerSchema>;
type T_PayloadToUsers = z.infer<typeof PayloadToUsersSchema>;

function validateInputToPaddle(payload: any): boolean {
  if (payload.move === PLAYER_NO_INPUT) {
    throw Error("Received a message with no valid payload.");
  }
  const to_right = payload.move === payload_MOVE_RIGHT;
  if (!to_right && payload_MOVE_LEFT !== payload.move) {
    console.error(
      `"Bad input request, payload.move wasnt one of:\n PLAYER_NO_INPUT:${PLAYER_NO_INPUT}, payload_MOVE_RIGHT:${payload_MOVE_RIGHT} or payload_MOVE_LEFT:${payload_MOVE_LEFT}`
    );
    return false;
  }
  return true;
}

export class PongManager {
  public pong_instances: Map<number, PongGame>;
  public static instance: PongManager;
  public debugGameID: number;
  constructor() {
    this.debugGameID = 0;
    this.pong_instances = new Map();
    if (PongManager.instance) {
      return PongManager.instance;
    }
    PongManager.instance = this;
    return this;
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

    const zodded = StartNewPongGameSchema.safeParse(client_request.payload);
    if (!zodded.success) {
      console.log("Invalid payload to start a game.: " + zodded.error);
	return {
        recipients: [user_id],
        payload: {
          status: httpStatus.BAD_REQUEST,
          func_name: process.env.FUNC_POPUP_TEXT,
          pop_up_text: "could not start pong game.",
        },
      }; 
    }
    const { player_list } = client_request.payload;
    // const { user_id } = parsed;
    const pong_game = PongGame.create(player_list);
    if (!pong_game) {
      return {
        recipients: [user_id],
        payload: {
          status: httpStatus.BAD_REQUEST,
          func_name: process.env.FUNC_POPUP_TEXT,
          pop_up_text: "could not start pong game.",
        },
      };
    }

    const game_id = this.debugGameID;
    this.debugGameID++;
    this.pong_instances.set(game_id, pong_game);
    // Send the users the game id.
    {
      return {
        recipients: [user_id],
        payload: {
          status: httpStatus.OK,
          func_name: process.env.FUNC_POPUP_TEXT,
          pop_up_text: "Your pong game_id is: " + game_id,
        },
      };
    }
  }

  sendInput(input: any) {
    const { user_id, payload } = input;
    if (!user_id || !payload) {
      throw Error("No userid or payload fields.");
    }
    const { board_id } = payload;
    if (!board_id) {
      console.error("Bad input, no board_id member.");
      return;
    }
    for (const [id, game] of this.pong_instances) {
      if (id !== board_id) {
        continue;
      }
      validateInputToPaddle(payload);
      game.setInputOnPaddle(user_id, payload.move);
    }
  }

//     sendOutput() : T_PayloadToUsers{
//     for (const [game_id, game] of this.pong_instances)
// 	{
// 		const recipients = Object.keys(game.players).map(key => Number(key));
// 	const payload: { balls: any[]; paddles: any[] } = {
//   balls: [],
//   paddles: []
// };


// 			for (const obj of game.balls_pos) {
// 			// extract values from each object and push to payload.list1
// 			payload.balls.push(obj.pos.x, obj.pos.y);
// 			}

// 			for (const obj of game.player_paddles) {
// 			// extract values from each object and push to payload.list2
// 			payload.paddles.push(obj.pos.x);
// 			payload.paddles.push(obj.pos.y);
// 			}
// 	}
// 	return ({recipients: recipients, payload:payload})
//   }
}

export default PongManager;
