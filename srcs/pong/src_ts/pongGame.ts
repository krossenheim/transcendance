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
// import user from "./utils/api/service/db/user.js";
import generateCirclePoints from "./generateCirclePoints.js";
import type { T_ForwardToContainer } from "utils/api/service/hub/hub_interfaces.js";
const MIN_PLAYERS: number = 2;
const MAX_PLAYERS: number = 8;

type hit = {
  alpha: number;
  point: Vec2;
  normal: Vec2;
};

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
    for (let i = 0; i < 1; i++) {
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
      throw new Error(
        "Should not be trying to find a player that isnt in this.players."
      );
    }
    paddle.setMoveOnNextFrame(move_right);
  }

  private tempSquareBoundaries() {
    for (const ball of this.pong_balls) {
      if (ball.pos.x < 0) {
        ball.pos.x = 0;
        ball.dir = scale(-1, ball.dir);
      } else if (ball.pos.x > this.board_size.x) {
        ball.pos.x = this.board_size.x;
        ball.dir = scale(-1, ball.dir);
      }

      if (ball.pos.y < 0) {
        ball.pos.y = 0;
        ball.dir = scale(-1, ball.dir);
      } else if (ball.pos.y > this.board_size.y) {
        ball.pos.y = this.board_size.y;
        ball.dir = scale(-1, ball.dir);
      }
    }
  }

  gameLoop() {
    const currentTime = Date.now();
    const deltaTime = (currentTime - this.last_frame_time) / 1000; // 0.5 = half a second
    this.last_frame_time = currentTime;

    const deltaFactor = this.timefactor * deltaTime;

    for (const paddle of this.player_paddles) {
      const p_movement = paddle.getMove(deltaFactor);
      paddle.lastMovement = p_movement; // store for collision detection
      if (is_zero(p_movement)) continue;
      paddle.pos.x += p_movement.x;
      paddle.pos.y += p_movement.y;
      for (let i = 0; i < paddle.segment.length; i++) {
        paddle.segment[i]!.x += p_movement.x;
        paddle.segment[i]!.y += p_movement.y;
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
