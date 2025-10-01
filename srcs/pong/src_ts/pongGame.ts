import type { Vec2 } from "./vector2.js";
import { add, sub, crossp, dotp, normalize, scale } from "./vector2.js";
import PlayerPaddle from "./playerPaddle.js";
import PongBall from "./pongBall.js";
// import user from "./utils/api/service/db/user.js";
import generateCirclePoints from "./generateCirclePoints.js";
import type { T_ForwardToContainer } from "utils/api/service/hub/hub_interfaces.js";
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

function distancePointToSegmentSquared(p: Vec2, a: Vec2, b: Vec2) {
  const ab = sub(b, a);
  const ap = sub(p, a);
  const t = Math.max(0, Math.min(1, dotp(ap, ab) / dotp(ab, ab)));
  const closest = { x: a.x + ab.x * t, y: a.y + ab.y * t };
  const dx = p.x - closest.x;
  const dy = p.y - closest.y;
  return dx * dx + dy * dy;
}

type hit = {
  alpha: number;
  point: Vec2;
  normal: Vec2;
};

export function getHit(
  ball: PongBall,
  polygon: Vec2[],
  polygon_vel: Vec2,
  ball_movem: Vec2
): hit | false {
  const numsides = polygon.length;
  if (numsides < 2) {
    throw new Error("Bad polygon with only < 2 sides.");
  }

  let earliesthit: hit | false = false;

  for (let i = 0; i < numsides; i++) {
    const seg_a = polygon[i]!;
    const seg_b = polygon[(i + 1) % numsides]!;

    const segments_rel_v = sub(polygon_vel, ball_movem);
    const seg_a_rel = sub(seg_a, ball.pos);
    const seg_b_rel = sub(seg_b, ball.pos);

    const candidate = circleTouchesSegment(
      { x: 0, y: 0 },
      segments_rel_v,
      ball.radius,
      seg_a_rel,
      seg_b_rel
    );

    if (candidate && (!earliesthit || candidate.alpha < earliesthit.alpha)) {
      earliesthit = candidate;
    }
  }
  if (earliesthit) {
    earliesthit.point = add(earliesthit.point, ball.pos);
  }
  return earliesthit;
}

function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const ab: Vec2 = { x: b.x - a.x, y: b.y - a.y };
  const t =
    ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / (ab.x * ab.x + ab.y * ab.y);

  // Clamp t to [0,1] to stay on the segment
  const clampedT = Math.max(0, Math.min(1, t));

  return {
    x: a.x + ab.x * clampedT,
    y: a.y + ab.y * clampedT,
  };
}

// Solve quadratic equation: a t^2 + b t + c = 0, return earliest t ∈ [0,1]
function getEarliestContactMoment(
  a: number,
  b: number,
  c: number
): number | null {
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) < 1e-12) return null;
    const t = -c / b;
    return t >= 0 && t <= 1 ? t : null;
  }

  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;

  const sqrtD = Math.sqrt(disc);
  const t1 = (-b - sqrtD) / (2 * a);
  const t2 = (-b + sqrtD) / (2 * a);

  const candidates = [t1, t2].filter((t) => t >= 0 && t <= 1);
  if (candidates.length === 0) return null;
  return Math.min(...candidates);
}

// Returns earliest collision with finite segment or its endpoints
// numerically stable quadratic solver
function solveQuadratic(a: number, b: number, c: number): number[] {
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) < 1e-12) return [];
    return [-c / b];
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  const sqrtD = Math.sqrt(disc);
  const q = -0.5 * (b + Math.sign(b) * sqrtD);
  const t1 = q / a;
  const t2 = c / q;
  const filtered = [t1, t2].filter((t) => t >= 1e-3);
  return filtered.sort((x, y) => x - y);
}
function length2(a: Vec2): number {
  return dotp(a, a);
}
// main routine
function circleTouchesSegment(
  circlePos: Vec2, // circle center (usually {0,0})
  circleVel: Vec2, // relative velocity of segment vs circle
  radius: number,
  segA: Vec2,
  segB: Vec2
): hit | false {
  const segVec = sub(segB, segA);
  const segLen2 = length2(segVec);
  if (segLen2 < 1e-12) {
    // segment is a point → fallback to point test
    return circleTouchesPoint(circlePos, circleVel, radius, segA);
  }

  const w0 = sub(circlePos, segA);

  // Coefficients for line collision
  const cross_cv_e = crossp(circleVel, segVec);
  const cross_w0_e = crossp(w0, segVec);
  const a = cross_cv_e * cross_cv_e;
  const b = 2 * cross_cv_e * cross_w0_e;
  const c = cross_w0_e * cross_w0_e - radius * radius * segLen2;

  const hits: hit[] = [];

  // 1. Line collision roots
  const roots = solveQuadratic(a, b, c);
  for (const t of roots) {
    if (t < 0) continue;
    // projection onto segment
    const u =
      dotp(add(w0, { x: circleVel.x * t, y: circleVel.y * t }), segVec) /
      segLen2;
    if (u >= 0 && u <= 1) {
      const contactPointLocal = { x: u * segVec.x, y: u * segVec.y };

      // contact point in world coordinates
      const contactPoint = add(circlePos, contactPointLocal); // normal is from contact point toward circle center at time t
      const circleCenter = add(circlePos, {
        x: circleVel.x * t,
        y: circleVel.y * t,
      });
      const n = sub(circleCenter, contactPoint);
      const nlen = Math.hypot(n.x, n.y) || 1;
      hits.push({
        alpha: t,
        point: contactPoint,
        normal: { x: n.x / nlen, y: n.y / nlen },
      });
    }
  }

  // 2. Endpoint collisions
  const endhitsA = circleTouchesPoint(circlePos, circleVel, radius, segA);
  if (endhitsA) hits.push(endhitsA);
  const endhitsB = circleTouchesPoint(circlePos, circleVel, radius, segB);
  if (endhitsB) hits.push(endhitsB);

  if (hits.length === 0) return false;
  hits.sort((h1, h2) => h1.alpha - h2.alpha);
  return hits[0]!;
}

// helper: moving circle vs stationary point
function circleTouchesPoint(
  circlePos: Vec2,
  circleVel: Vec2,
  radius: number,
  pt: Vec2
): hit | false {
  const w = sub(circlePos, pt);
  const a = dotp(circleVel, circleVel);
  const b = 2 * dotp(w, circleVel);
  const c = dotp(w, w) - radius * radius;

  const roots = solveQuadratic(a, b, c);
  for (const t of roots) {
    if (t >= 0) {
      const circleCenter = add(circlePos, {
        x: circleVel.x * t,
        y: circleVel.y * t,
      });
      const n = sub(circleCenter, pt);
      const nlen = Math.hypot(n.x, n.y) || 1;
      return {
        alpha: t,
        point: pt,
        normal: { x: n.x / nlen, y: n.y / nlen },
      };
    }
  }
  return false;
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
      for (let i = 0; i < paddle.polygon.length; i++) {
        paddle.polygon[i]!.x += p_movement.x;
        paddle.polygon[i]!.y += p_movement.y;
      }
    }
    for (const ball of this.balls_pos) {
      let b_movement = scale(deltaFactor * ball.s, ball.d);
      if (Math.hypot(b_movement.x, b_movement.y) < 1e-3) continue;

      for (const paddle of this.player_paddles) {
        const p_movement = paddle.lastMovement;

        let hit: false | hit = false;
        hit = getHit(ball, paddle.polygon, p_movement, b_movement);
        if (hit === false) {
          ball.pos.x += b_movement.x;
          ball.pos.y += b_movement.y;
          continue;
        }
        if (dotp(b_movement, sub(paddle.pos, ball.pos)) < 0) {
          continue;
        }
        // const n = normalize(hit.normal);
        ball.d = scale(-1, ball.d);
        // b_movement = scale(deltaFactor * ball.s, ball.d);
        console.log("playerid", paddle.player_ID, " hit alpha: ", hit.alpha);
        console.log("playerid", paddle.player_ID, "hit normal: ", hit.normal);
        console.log("playerid", paddle.player_ID, "hit point: ", hit.point);
        continue;
      }

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
