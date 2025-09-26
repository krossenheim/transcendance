import PongGame from "./pongGame.js";

const payload_MOVE_RIGHT = 1;
const payload_MOVE_LEFT = 0;
const PLAYER_NO_INPUT = undefined;

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
  private pong_instances: Map<number, PongGame>;
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

  startGame(board_x: number, board_y: number, player_list: Array<number>): number {
    const pong_game = PongGame.create({ x: board_x, y: board_y }, player_list);
    if (!pong_game) {
      return -1;
    }
    const game_id = this.debugGameID;
    this.debugGameID++;
    this.pong_instances.set(game_id, pong_game);
    // Send the users the game id.
    return game_id;
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
}

export default PongManager;
