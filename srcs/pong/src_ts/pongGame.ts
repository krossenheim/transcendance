import type { Vec2 } from "./vector2.js";
import { Result } from "./utils/api/service/common/result.js";
import {
  add,
  sub,
  crossp,
  dotp,
  normalize,
  scale,
  is_zero,
  rotate,
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
import { spawn } from "child_process";
import { number } from "zod";
const MIN_PLAYERS: number = 2;
const MAX_PLAYERS: number = 8;
const MAP_GAMEOVER_EDGES_WIDTH = 40;

function truncDecimals(num: number, n: number = 6) {
  const factor = Math.pow(10, n);
  return Math.trunc(num * factor) / factor;
}

function rotatePolygon(
  points: Vec2[], // array of vertices
  center: Vec2, // point to rotate around
  angleRad: number // rotation angle in radians
): Vec2[] {
  return points.map((p) => {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    return {
      x: dx * cos - dy * sin + center.x,
      y: dx * sin + dy * cos + center.y,
    };
  });
}

class PongGame {
  private board_size: Vec2;
  private map_polygon_edges: Vec2[];
  public player_paddles: Array<PlayerPaddle>;
  public player_id_to_paddle: Map<number, PlayerPaddle>;
  public player_ids: Array<number>;
  public pong_balls: Array<PongBall>;
  // public debug_play_field: Array<Vec2>;
  private last_frame_time: number;
  private readonly timefactor: number = 1;

  private constructor(player_ids: Array<number>) {
    this.player_ids = player_ids;
    this.board_size = { x: 1000, y: 1000 };
    this.pong_balls = this.spawn_balls(20);
    this.player_id_to_paddle = this.spawn_paddles(player_ids);
    this.player_paddles = Array.from(this.player_id_to_paddle.values());
    this.map_polygon_edges = this.spawn_map_edges(player_ids.length);
    this.last_frame_time = Date.now(); // initial timestamp in ms
  }

  // function validateToken(token: string): Result<number, string> {
  // 	let decoded: { uid: number; iat: number; exp: number; };
  // 	try {
  // 		decoded = jwt.verify(token, secretKey) as { uid: number; iat: number; exp: number; };
  // 	} catch (err) {
  // 		return Result.Err('Invalid JWT');
  // 	}

  // 	if (typeof decoded.exp !== 'number' || Date.now() >= decoded.exp * 1000) {
  // 		return Result.Err('JWT expired');
  // 	}

  // 	if (typeof decoded.uid !== 'number' || decoded.uid < 1)
  // 		return Result.Err('Invalid JWT payload');
  // 	else
  // 		return Result.Ok(decoded.uid);
  // }

  static create(player_ids: Array<number>): Result<PongGame, string> {
    if (new Set(player_ids).size !== player_ids.length) {
      console.error("Non unique ids passed as player_ids");
      return Result.Err("Non unique ids passed as player_ids");
    }
    if (player_ids.length < MIN_PLAYERS || player_ids.length > MAX_PLAYERS) {
      console.error("Less or more than 2-8 players.");
      return Result.Err("Less or more than 2-8 players.");
    }
    for (const player_id of player_ids) {
      if (player_id < 1 || !Number.isInteger(player_id)) {
        console.error("Player ID is less than one, or not an integer.");
        return Result.Err("Player ID is less than one, or not an integer.");
      }
      const count = player_ids.filter((n) => n === player_id).length;
      if (count < 1 && count > 2) {
        console.error("Player ID appears more than twice.");
        return Result.Err("Player ID appears more than twice.");
      }
    }
    try {
      return Result.Ok(new PongGame(player_ids));
    } catch (e) {
      console.error(
        "Factory method failed to create new instance of PongGame, player list was: ",
        player_ids
      );
      return Result.Err("Failed to create new instance of PongGame");
    }
  }

  private spawn_paddles(player_ids: Array<number>): Map<number, PlayerPaddle> {
    const player_to_paddle_map: Map<number, PlayerPaddle> = new Map();
    const paddle_positions = generateCirclePoints(
      player_ids.length,
      Math.min(this.board_size.x, this.board_size.y) * 0.25,
      { x: this.board_size.y / 2, y: this.board_size.x / 2 }
    );

    let idxpaddle = 0;
    for (const player_id of player_ids) {
      const vector = paddle_positions[idxpaddle++];
      if (vector === undefined) {
        throw Error("Constructor failed to validate player ids.");
      }
      const paddle = new PlayerPaddle(vector, this.board_size, player_id);
      console.log(`Player_ID '${player_id}' has paddle_ID '${paddle.id}'`);
      player_to_paddle_map.set(player_id, paddle);
    }
    console.log("Added players:", Array.from(this.player_id_to_paddle.keys()));
    return player_to_paddle_map;
  }

  private spawn_map_edges(player_count: number): Vec2[] {
    const side_length = this.player_paddles[0]!.length * 3;

    let vertices_count = player_count * 2 - 1;
    if (player_count === 3) vertices_count = 3;
    else if (player_count === 2 || player_count === 4) {
      vertices_count = 4;
    }
    const limits_of_the_map = generateCirclePoints(
      player_count,
      Math.min(this.board_size.x, this.board_size.y) * (0.25 + 0.05),
      { x: this.board_size.y / 2, y: this.board_size.x / 2 }
    );
    const rotated_limits: Vec2[] = [];
    // Rotate to match sides of player count

    for (const vector of limits_of_the_map) {
      const rotated_vector = vector;
      rotated_limits.push(rotated_vector);
    }
    rotatePolygon(
      rotated_limits,
      scale(0.5, this.board_size),
      (2 * Math.PI) / this.player_paddles.length
    );
    return rotated_limits;
  }

  private spawn_balls(count: number): Array<PongBall> {
    const balls = [];
    for (let i = 0; i < count; i++) {
      balls.push(
        new PongBall(
          { x: this.board_size.x / 2, y: this.board_size.y / 2 },
          this.board_size
        )
      );
    }
    return balls;
  }

  setInputOnPaddle(user_id: number, move_right: boolean | null) {
    const paddle = this.player_id_to_paddle.get(user_id);
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
    for (const pong_ball of this.pong_balls) {
      const pb_movement = pong_ball.getMove(deltaFactor);
      for (let i = 0; i < this.map_polygon_edges.length - 1; i++) {
        const segment_a = this.map_polygon_edges[i]!;
        const segment_b = this.map_polygon_edges[i + 1]!;
        const hits_wall = pong_ball.checkSegmentCollision(
          pong_ball.pos,
          segment_a,
          segment_b,
          { x: 0, y: 0 },
          pb_movement,
          pong_ball.radius + MAP_GAMEOVER_EDGES_WIDTH,
          MAP_GAMEOVER_EDGES_WIDTH
        );
      }
      //this.tempSquareBoundaries();
    }
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
