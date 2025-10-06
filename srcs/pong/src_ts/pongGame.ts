import type { Vec2 } from "./vector2.js";
import {
  add,
  sub,
  crossp,
  dotp,
  normalize,
  scale,
  is_zero,
} from "./vector2.js";
import PlayerPaddle from "./playerPaddle.js";
import PongBall from "./pongBall.js";
import type {
  TypePongBall,
  TypePongPaddle,
  TypeGameStateSchema,
} from "./utils/api/service/pong/pong_interfaces.js";
// import user from "./utils/api/service/db/user.js";
import generateCirclePoints from "./generateCirclePoints.js";
const MIN_PLAYERS: number = 2;
const MAX_PLAYERS: number = 8;

function truncDecimals(num: number, n: number = 6) {
  const factor = Math.pow(10, n);
  return Math.trunc(num * factor) / factor;
}

class PongGame {
  private board_size: Vec2;
  public player_paddles: Array<PlayerPaddle>;
  public player_to_paddle: Map<number, PlayerPaddle>;
  public players: Array<number>;
  public pong_balls: Array<PongBall>;
  // public debug_play_field: Array<Vec2>;
  private last_frame_time: number;
  private readonly timefactor: number = 1;

  private constructor(player_ids: Array<number>) {
    this.players = player_ids;
    this.board_size = { x: 1000, y: 1000 };
    // this.debug_play_field = generateCirclePoints(4,
    //   Math.min(this.board_size.x, this.board_size.y) * 0.75), { x: this.board_size.y / 2, y: this.board_size.x / 2 });
    this.pong_balls = [];
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
      Math.min(this.board_size.x, this.board_size.y) * 0.25,
      { x: this.board_size.y / 2, y: this.board_size.x / 2 }
    );

    let idxpaddle = 0;
    for (const player_id of player_ids) {
      const vector = paddle_positions[idxpaddle++];
      if (vector === undefined) {
        throw Error("There should be as many paddle positions as players.");
      }
      console.log("Placing paddle at: ", vector.x, ",", vector.y);

      const paddle = new PlayerPaddle(vector, this.board_size, player_id);
      this.player_to_paddle.set(player_id, paddle);
      this.player_paddles.push(paddle);
    }
    console.log("Added players:", Array.from(this.player_to_paddle.keys()));
    for (let i = 0; i < 40; i++) {
      this.pong_balls.push(
        new PongBall(
          { x: this.board_size.x / 2, y: this.board_size.y / 2 },
          this.board_size
        )
      );
    }

    console.log(`Initialized ${player_ids.length} paddles`);
  }

  setInputOnPaddle(user_id: number, move_right: boolean | null) {
    const paddle = this.player_to_paddle.get(user_id);
    if (!paddle) {
      console.error("Couldnt find paddle for player id: ", user_id, "???");
      return;
    }
    paddle.setMoveOnNextFrame(move_right);
  }

  private tempSquareBoundaries() {
    for (const ball of this.pong_balls) {
      if (ball.pos.x < 0) {
        ball.pos.x = 0;
        ball.dir = scale(-1, ball.dir);
        ball.lastCollidedWith = null;
      } else if (ball.pos.x > this.board_size.x) {
        ball.pos.x = this.board_size.x;
        ball.dir = scale(-1, ball.dir);
        ball.lastCollidedWith = null;
      }

      if (ball.pos.y < 0) {
        ball.pos.y = 0;
        ball.dir = scale(-1, ball.dir);
        ball.lastCollidedWith = null;
      } else if (ball.pos.y > this.board_size.y) {
        ball.pos.y = this.board_size.y;
        ball.dir = scale(-1, ball.dir);
        ball.lastCollidedWith = null;
      }
    }
  }

  getGameState(): TypeGameStateSchema {
    const payload: { balls: TypePongBall[]; paddles: TypePongPaddle[] } = {
      balls: [],
      paddles: [],
    };

    for (const obj of this.pong_balls) {
      payload.balls.push({
        id: truncDecimals(obj.id),
        x: truncDecimals(obj.pos.x),
        y: truncDecimals(obj.pos.y),
        dx: truncDecimals(obj.dir.x),
        dy: truncDecimals(obj.dir.y),
        r: truncDecimals(obj.radius),
      });
    }

    for (const obj of this.player_paddles) {
      payload.paddles.push({
        x: truncDecimals(obj.pos.x),
        y: truncDecimals(obj.pos.y),
        r: truncDecimals(obj.r),
        w: truncDecimals(obj.width),
        l: truncDecimals(obj.length),
      });
    }
    return payload;
  }

  gameLoop() {
    const currentTime = Date.now();
    const deltaTime = (currentTime - this.last_frame_time) / 1000; // 0.5 = half a second
    this.last_frame_time = currentTime;

    const deltaFactor = this.timefactor * deltaTime;

    for (const paddle of this.player_paddles) {
      const p_movement = paddle.getMove(deltaFactor);
      paddle.lastMovement = p_movement; // store for collision detection
      if (!is_zero(p_movement)) {
        paddle.pos.x += p_movement.x;
        paddle.pos.y += p_movement.y;
        // regenerate segment from current pos and direction
        paddle.segment = paddle.makeSegment(
          paddle.pos,
          paddle.d,
          paddle.length
        );
      }
    }
    for (const pong_ball of this.pong_balls) {
      const pb_movement = pong_ball.getMove(deltaFactor);
      pong_ball.movePaddleAware(pb_movement, this.player_paddles);
    }
    this.tempSquareBoundaries();
  }
}

function reflect(v: Vec2, n: Vec2): Vec2 {
  // assume n is normalized
  let dotproduct = dotp(v, n);
  return {
    x: v.x - 2 * dotproduct * n.x,
    y: v.y - 2 * dotproduct * n.y,
  };
}

export default PongGame;
