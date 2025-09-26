import type { Vec2 } from "./utils/api/service/common/vector2.js";
import { scale, normalize } from "./utils/api/service/common/vector2.js";
import PlayerPaddle from "./playerPaddle.js";
import PongBall from "./pongBall.js";
// import user from "./utils/api/service/db/user.js";

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
  public player_paddles: Array<PlayerPaddle>;
  public player_to_paddle: Map<number, PlayerPaddle>;
  public players: Array<number>;
  public balls_pos: Array<PongBall>;
  private last_frame_time: number;
  private readonly timefactor: number = 1;

  private constructor(player_ids: Array<number>) {
    this.players = player_ids;
    this.board_size = { x: 1000, y:1000};
    this.balls_pos = [];
    this.player_paddles = [];
    this.player_to_paddle = new Map();
    this.last_frame_time = Date.now(); // initial timestamp in ms
    this.initializeBoard(player_ids);
  }

  static create(player_ids: Array<number>): PongGame | null {
    if (new Set(player_ids).size !== player_ids.length) {
      console.error("Non unique ids passed as player_ids");
      return null;
    }
    if (player_ids.length < MIN_PLAYERS || player_ids.length > MAX_PLAYERS)
      return null;
    return new PongGame(player_ids);
  }

  initializeBoard(player_ids: Array<number>) {
    const paddle_positions = generateCirclePoints(
      player_ids.length,
      this.board_size.x * 0.48, // min of boardsize.x/y
      { x: this.board_size.y/2, y: this.board_size.x/2 }
    );

    let idxpaddle = 0;
    for (const player_id of player_ids) {
      const vector = paddle_positions[idxpaddle++];
      if (vector === undefined) {
        throw Error("There should be as many paddle positions as players.");
      }
      console.log("Placing paddle at: " , vector.x, ",", vector.y);

      const paddle = new PlayerPaddle(vector, this.board_size, player_id);
      this.player_to_paddle.set(player_id, paddle);
      this.player_paddles.push(paddle);
    }
	console.log("Added players:", Array.from(this.player_to_paddle.keys()));
    this.balls_pos.push(
      new PongBall(
        { x: this.board_size.x / 2, y: this.board_size.y / 2 },
        this.board_size
      ),      new PongBall(
        { x: this.board_size.x / 2, y: this.board_size.y / 2 },
        this.board_size
      ),      new PongBall(
        { x: this.board_size.x / 2, y: this.board_size.y / 2 },
        this.board_size
      ),      new PongBall(
        { x: this.board_size.x / 2, y: this.board_size.y / 2 },
        this.board_size
      ),      new PongBall(
        { x: this.board_size.x / 2, y: this.board_size.y / 2 },
        this.board_size
      ),      new PongBall(
        { x: this.board_size.x / 2, y: this.board_size.y / 2 },
        this.board_size
      ),      new PongBall(
        { x: this.board_size.x / 2, y: this.board_size.y / 2 },
        this.board_size
      )
    );
	this.gameLoop();
    console.log(`Initialized ${player_ids.length} paddles`);
  }

  setInputOnPaddle(user_id: number, move_right: boolean | null) {
    const paddle = this.player_to_paddle.get(user_id);
    if (!paddle) {
      throw new Error("Should not be trying to find a player that isnt in this.players.");
    }
    paddle.setMoveOnNextFrame(move_right);
  }

  gameLoop() {
    // if (!payloadIsValid(forwarded_to_container)) {
    //   return;
    // }
    const currentTime = Date.now();
    const deltaTime = (currentTime - this.last_frame_time) / 1000; // seconds elapsed
    this.last_frame_time = currentTime;

    // Example: move object at this.timefactor units per second
    const deltaFactor = this.timefactor * deltaTime;
    for (const paddle of this.player_paddles) {
      paddle.move(deltaFactor);
    }
    for (const ball of this.balls_pos) {
      ball.move(deltaFactor);
    }
    // setImmediate(this.gameLoop); // avoid stack overflows but is recursive, probably call this outside and passing args to gameLoop.
  }
}

export default PongGame;
