import type { Vec2 } from "./vector2.js";
import { scale, normalize } from "./vector2.js";
import PlayerPaddle from "./playerPaddle.js";

const FAKE_PLAYERID: number = 10;
const MIN_PLAYERS: number = 2;
const MAX_PLAYERS: number = 8;

function generateCirclePoints(n: number, radius = 1, offset: Vec2): Vec2[] {
  if (n < 2 || n > 8) throw new Error("n must be between 2 and 8");

  const points: Vec2[] = [];
  const angleStep = (2 * Math.PI) / n; // step in radians

  for (let i = 0; i < n; i++) {
    const angle = i * angleStep;
    points.push({
      x: Math.cos(angle) * radius + offset.x,
      y: Math.sin(angle) * radius + offset.y,
    });
  }

  return points;
}

type PongUserInputType = {
  user_id: number;
  move_r: number;
};

function payloadIsValid(forwarded_to_container: any) {
  if (forwarded_to_container.user_id === undefined) {
    throw Error("No propery user_id for gameloop.");
  }
  if (forwarded_to_container.payload === undefined) {
    throw Error("Received input from undefined user.");
  }
  if (forwarded_to_container.payload.move_r === undefined) {
    console.error(
      "Received empty input from user " + forwarded_to_container.user_id
    );
    return false;
  }
  return true;
}

class PongGame {
  private board_size: Vec2;
  private player_paddles: Array<PlayerPaddle>;
  private players: Map<number, PlayerPaddle>;
  private balls_pos: Array<Vec2>;
  private last_frame_time: number;
  private readonly timefactor: number = 1;

  private constructor(board_size: Vec2, player_ids: Array<number>) {
    this.board_size = board_size;
    this.balls_pos = [{ x: board_size.x / 2, y: board_size.y / 2 }];
    this.player_paddles = [];
    this.players = new Map();
    this.last_frame_time = Date.now(); // initial timestamp in ms
    this.initializeBoard(player_ids);
  }

  static create(board_size: Vec2, player_ids: Array<number>): PongGame | null {
    if (new Set(player_ids).size !== player_ids.length) {
      console.error("Non unique ids passed as player_ids");
      return null;
    }
    if (player_ids.length < MIN_PLAYERS || player_ids.length > MAX_PLAYERS)
      return null;
    if (board_size.x < 1 || board_size.y < 1) {
      return null;
    }
    return new PongGame(board_size, player_ids);
  }

  initializeBoard(player_ids: Array<number>) {
    const paddle_positions = generateCirclePoints(
      player_ids.length,
      this.board_size.x * 0.95,
      { x: this.board_size.y, y: -this.board_size.x }
    );

    for (const player_id of player_ids) {
      const vector = paddle_positions.pop();
      if (vector === undefined) {
        throw Error("There should be as many paddle positions as players.");
      }

      const paddle = new PlayerPaddle(vector, this.board_size, player_id);
      this.players.set(player_id, paddle);
      this.player_paddles.push(paddle);
    }
    console.log(`Initialized ${player_ids.length} paddles`);
  }

  setInputOnPaddle(user_id: number, move_right: boolean) {
    const paddle = this.players.get(user_id);
    if (!paddle) {
      console.log(
        `User ID ${user_id} not in this game. Participants are: ${this.players.keys()}`
      );
      return;
    }
    paddle.setMoveOnNextFrame(move_right);
  }

  gameLoop(forwarded_to_container: any) {
    if (!payloadIsValid(forwarded_to_container)) {
      return;
    }

    const currentTime = Date.now();
    const deltaTime = (currentTime - this.last_frame_time) / 1000; // seconds elapsed
    this.last_frame_time = currentTime;

    // Example: move object at this.timefactor units per second
    const deltaFactor = this.timefactor * deltaTime;
    for (const paddle of this.player_paddles) {
      paddle.move(deltaFactor);
    }
    for (const ball in this.balls_pos) {
      ball.move(deltaFactor);
    }
    setImmediate(this.gameLoop); // avoid stack overflows but is recursive, probably call this outside and passing args to gameLoop.
  }
}

export default PongGame;
