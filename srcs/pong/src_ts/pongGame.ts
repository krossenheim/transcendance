import type { Vec2 } from "./vector2.js";
import { sub, crossp, dotp, normalize, scale } from "./vector2.js";
import PlayerPaddle from "./playerPaddle.js";
import PongBall from "./pongBall.js";
// import user from "./utils/api/service/db/user.js";
import generateCirclePoints from "./generateCirclePoints.js";
import type { T_ForwardToContainer } from "utils/api/service/hub/hub_interfaces.js";
import { ref } from "process";
const MIN_PLAYERS: number = 2;
const MAX_PLAYERS: number = 8;

function payloadIsValid(pong_to_world: T_ForwardToContainer) {
  if (pong_to_world.user_id === undefined) {
    throw Error("No propery user_id for gameloop.");
  }
  if (pong_to_world.payload === undefined) {
    throw Error("Received input from undefined user.");
  }
  if (pong_to_world.payload.move_r === undefined) {
    console.error("Received empty input from user " + pong_to_world.user_id);
    return false;
  }
  return true;
}

function getCoefficients(
  c_vel: Vec2,
  e: Vec2,
  w0: Vec2,
  c_radius: number
): [number, number, number] {
  const cross_cv_e = crossp(c_vel, e);
  const cross_w0_e = crossp(w0, e);
  const e_len2 = dotp(e, e);

  const a = cross_cv_e * cross_cv_e;
  const b = 2 * cross_cv_e * cross_w0_e;
  const c = cross_w0_e * cross_w0_e - c_radius * c_radius * e_len2;

  return [a, b, c];
}

function getEarliestContactMoment(
  a: number,
  b: number,
  c: number
): number | null {
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;

  const sqrtD = Math.sqrt(discriminant);
  const t1 = (-b - sqrtD) / (2 * a);
  const t2 = (-b + sqrtD) / (2 * a);

  // pick the smallest t in [0,1]
  const candidates = [t1, t2].filter((t) => t >= 0 && t <= 1);
  if (candidates.length === 0) return null;

  return Math.min(...candidates);
}
type hit = {
  alpha: number;
  point: Vec2;
  normal: Vec2;
};

const clamp = (v: number) => Math.max(-1e6, Math.min(1e6, v));

export function getHit(
  ball: PongBall,
  polygon: Vec2[],
  polygon_vel: Vec2
): hit | false {
  const numsides = polygon.length;
  if (numsides < 2) {
    throw new Error("Bad polygon with only < 2 sides.");
  }
  let hit: false | hit = false;
  const polygon_stationary: boolean = polygon_vel.x == 0 && polygon_vel.y == 0;

  for (let i = 1; i < numsides; i++) {
    const seg_a = polygon[i - 1]!; // Ignoring TS warning ;
    const seg_b = polygon[i]!; // ignoring !
    if (polygon_stationary) {
      console.log("stationary polyg");
      hit = circleTouchesSegment(ball.pos, ball.d, ball.r, seg_a, seg_b);
    } else {
      console.log("un- stationary polyg");
      const segments_rel_v = sub(polygon_vel, ball.d);
      const seg_a_rel = sub(seg_a, ball.pos);
      const seg_b_rel = sub(seg_b, ball.pos);

      hit = circleTouchesSegment(
        { x: 0, y: 0 },
        segments_rel_v,
        ball.r,
        seg_a_rel,
        seg_b_rel
      );
    }
    if (hit) {
      return hit;
    }
  }
  return false;
}

function circleTouchesSegment(
  c_start_pos: Vec2,
  c_vel: Vec2,
  sweep_radius: number,
  seg_a: Vec2,
  seg_b: Vec2
): hit | false {
  const seg_vec: Vec2 = sub(seg_b, seg_a); //e: vector from seg_a to seg_b
  const w0: Vec2 = sub(c_start_pos, seg_a); // vector from seg_a to c_start_pos;

  const [a, b, c] = getCoefficients(c_vel, seg_vec, w0, sweep_radius);

  let moment: number | null = getEarliestContactMoment(a, b, c);
  // moment is 'alpha' its a magnitude from 0 to 1 between two moments
  if (moment === null) {
    return false;
  }
  console.log("Momento: ", moment);
  const hitPoint: Vec2 = {
    x: seg_a.x + seg_vec.x * moment,
    y: seg_a.y + seg_vec.y * moment,
  };
  const normal: Vec2 = normalize({
    x: c_start_pos.x + c_vel.x * moment - hitPoint.x,
    y: c_start_pos.y + c_vel.y * moment - hitPoint.y,
  });
  return { normal: normal, alpha: moment, point: hitPoint };
}

class PongGame {
  private board_size: Vec2;
  public player_paddles: Array<PlayerPaddle>;
  public player_to_paddle: Map<number, PlayerPaddle>;
  public players: Array<number>;
  public balls_pos: Array<PongBall>;
  private last_frame_time: number;
  private readonly timefactor: number = 0.1;

  private constructor(player_ids: Array<number>) {
    this.players = player_ids;
    this.board_size = { x: 1000, y: 1000 };
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
      Math.min(this.board_size.x, this.board_size.y) * 0.48,
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
    this.balls_pos.push(
      new PongBall(
        { x: this.board_size.x / 2, y: this.board_size.y / 2 },
        this.board_size
      ),
      new PongBall(
        { x: this.board_size.x / 2, y: this.board_size.y / 2 },
        this.board_size
      ),
      new PongBall(
        { x: this.board_size.x / 2, y: this.board_size.y / 2 },
        this.board_size
      ),
      new PongBall(
        { x: this.board_size.x / 2, y: this.board_size.y / 2 },
        this.board_size
      ),
      new PongBall(
        { x: this.board_size.x / 2, y: this.board_size.y / 2 },
        this.board_size
      ),
      new PongBall(
        { x: this.board_size.x / 2, y: this.board_size.y / 2 },
        this.board_size
      ),
      new PongBall(
        { x: this.board_size.x / 2, y: this.board_size.y / 2 },
        this.board_size
      )
    );
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

  gameLoop() {
    const currentTime = Date.now();
    const deltaTime = (currentTime - this.last_frame_time) / 1000; // 0.5 = half a second
    this.last_frame_time = currentTime;

    const deltaFactor = this.timefactor * deltaTime;

    for (const paddle of this.player_paddles) {
      const p_movement = paddle.getMove(deltaFactor);
      paddle.pos.x += p_movement.x;
      paddle.pos.y += p_movement.y;
      paddle.lastMovement = p_movement; // store for collision detection
    }
    for (const ball of this.balls_pos) {
      let b_movement = scale(deltaFactor * ball.s, ball.d);

      for (const paddle of this.player_paddles) {
        const p_movement = paddle.lastMovement;

        while (Math.hypot(b_movement.x, b_movement.y) > 1e-3) {
          const hit = getHit(ball, paddle.polygon, p_movement);
          if (hit === false) {
            ball.pos.x += b_movement.x;
            ball.pos.y += b_movement.y;
            break;
          }
          console.log("Hit not false");
          const moved = scale(Math.max(0.001, 1 - hit.alpha), b_movement);
          ball.pos.x += moved.x;
          ball.pos.y += moved.y;

          b_movement = scale(Math.max(0.001, 1 - hit.alpha), b_movement);
          ball.d = reflect(ball.d, hit.normal);
        }
      }
      ball.pos.x += b_movement.x;
      ball.pos.y += b_movement.y;
      if (ball.pos.x < 0) {
        ball.pos.x = 0;
        ball.reflectX();
      } else if (ball.pos.x > this.board_size.x) {
        ball.pos.x = this.board_size.x;
        ball.reflectX();
      }

      if (ball.pos.y < 0) {
        ball.pos.y = 0;
        ball.reflectY();
      } else if (ball.pos.y > this.board_size.y) {
        ball.pos.y = this.board_size.y;
        ball.reflectY();
      }
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
