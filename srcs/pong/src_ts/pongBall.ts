import type PlayerPaddle from "playerPaddle.js";
import type { Vec2 } from "./vector2.js";
import {
  is_zero,
  normalize,
  sub,
  len2,
  dotp,
  len,
  scale,
  add,
} from "./vector2.js";
import { timeStamp } from "console";

function randomAvoidAxes(epsilon = 0.05): number {
  const quarter = Math.PI / 2;

  const quarterIndex = Math.floor(Math.random() * 4);
  // pick a random angle inside the quarter, avoiding epsilon at edges
  const r =
    quarterIndex * quarter + epsilon + Math.random() * (quarter - 2 * epsilon);
  return r;
}

function solveQuadratic(a: number, b: number, c: number): number | null {
  if (a < 1e-8) {
    return null;
  }

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0 && discriminant > -1e-8) return 0;

  if (discriminant > 0) {
    const root1 = (-b + Math.sqrt(discriminant)) / (2 * a);
    const root2 = (-b - Math.sqrt(discriminant)) / (2 * a);
    return Math.min(root1, root2);
  } else if (discriminant === 0) {
    const root = -b / (2 * a);
    return root;
  }
  return null;
}

export class PongBall {
  // private constants
  private readonly game_size: Vec2;

  public pos: Vec2;
  public radius: number;
  public dir: Vec2;
  public speed: number;
  public id: number;
  private static debugcountstatic: number = 0;
  constructor(start_pos: Vec2, game_size: Vec2, speed = 400) {
    this.game_size = game_size;
    this.id = PongBall.debugcountstatic++;
    this.pos = { ...start_pos };
    this.radius = 15;
    const r = randomAvoidAxes();
    this.speed = speed;
    this.dir = normalize({ x: Math.cos(r), y: Math.sin(r) });
  }

  getMove(deltaFactor: number): Vec2 {
    // this.pos.x += this.dir.x * deltaFactor * this.speed;
    // this.pos.y += this.dir.y * deltaFactor * this.speed;
    const wantedMove = {
      x: this.dir.x * deltaFactor * this.speed,
      y: this.dir.y * deltaFactor * this.speed,
    };
    if (is_zero(wantedMove)) {
      throw Error("Ball speed is zero this isn't expected.");
    }
    return wantedMove;
  }

  checkEndpointCollision(
    vertex: Vec2,
    paddleMovement: Vec2,
    ballPos: Vec2,
    ballMovement: Vec2,
    effectiveRadius: number
  ): number | null {
    // Quadratic for |(C - v t) - X|^2 = rEff^2
    const movementRel = sub(paddleMovement, ballMovement);
    const diff = sub(ballPos, vertex);
    if (len(diff) <= effectiveRadius + 1e-8) return 0;
    // Inside segment.. shouldnt happen but floating point and all.
    // if (len(diff) <= effectiveRadius + 1e-8) return null;
    const a = dotp(movementRel, movementRel);
    if (a < +1e-8) return null;
    const b = -2 * dotp(movementRel, diff);
    const c = dotp(diff, diff) - effectiveRadius * effectiveRadius;

    const t = solveQuadratic(a, b, c); // Only returns tmin even if disc >= 0
    if (t === null) return null;
    if (t < 0 || t > 1) return null;
    return t;
  }
  checkSegmentCollision(
    A: Vec2,
    B: Vec2,
    paddleMovement: Vec2,
    ballPos: Vec2,
    ballMovement: Vec2,
    effectiveRadius: number
  ): number | null {
    const movementRel = sub(paddleMovement, ballMovement); // relative movement

    const AB = sub(B, A);
    const AB_len2 = dotp(AB, AB);
    if (AB_len2 < 1e-8) return null; // degenerate segment

    const AP = sub(ballPos, A);

    // Project AP onto AB, clamped to segment
    const t_seg = Math.max(0, Math.min(1, dotp(AP, AB) / AB_len2));
    const closest = add(A, scale(t_seg, AB)); // closest point on AB at t=0

    // Now treat as vertex collision with closest point
    const diff = sub(ballPos, closest);
    const dist2 = dotp(diff, diff);

    if (dist2 <= effectiveRadius * effectiveRadius + 1e-8) {
      // Already overlapping at t = 0
      return 0;
    }
    const a = dotp(movementRel, movementRel);
    if (a < 1e-8) return null;
    const b = -2 * dotp(movementRel, diff);
    const c = dotp(diff, diff) - effectiveRadius * effectiveRadius;

    const t = solveQuadratic(a, b, c);
    if (t === null) return null;
    if (t < -1e-8 || t > 1 + 1e-8) return null;

    // Optional: check that at collision time, the point is still within segment
    const closestAtT = add(closest, scale(t, movementRel));
    const proj = dotp(sub(closestAtT, A), AB) / AB_len2;
    if (proj >= -1e-8 && proj <= 1 + 1e-8) {
      return t;
    }
    return null;
  }

  // closestPointRelativeToP(
  //   A: Vec2,
  //   B: Vec2,
  //   P: Vec2,
  //   vAB: Vec2,
  //   vP: Vec2,
  //   r: number,
  //   w: number
  // ) {
  //   // Move AB to P's frame
  //   const Arel: Vec2 = { x: A.x - P.x, y: A.y - P.y };
  //   const Brel: Vec2 = { x: B.x - P.x, y: B.y - P.y };

  //   const AB: Vec2 = { x: Brel.x - Arel.x, y: Brel.y - Arel.y };

  //   const ab2 = AB.x * AB.x + AB.y * AB.y;
  //   const t = -(Arel.x * AB.x + Arel.y * AB.y) / ab2; // project origin

  //   if (t < 0.0 || t > 1.0) return null; // perpendicular outside segment

  //   const Q: Vec2 = { x: Arel.x + t * AB.x, y: Arel.y + t * AB.y };

  //   // Optional: check width + radius
  //   const dist2 = len2(Q);
  //   const radiusSum = r + w / 2;
  //   if (dist2 > radiusSum * radiusSum) return null;

  //   return Q;
  // }
  movePaddleAware(movement_vec: Vec2, paddles: PlayerPaddle[]) {
    // 1.  Check each end of the paddle segment, to see if distance from circle_center to seg_a/seg_b < circle_radius + paddle.width
    // 2.  Check if the point's projection falls within seg_a and seg_b (90 degrees). If so, check distance from circle_center to seg_a/seg_b < circle_radius + paddle.width

    let col_time_slice: null | number = null;

    for (const paddle of paddles) {
      const effective_radius = this.radius + paddle.width + 1e-8; // effective radius
      const MAX_UNITS = 4;

      // Compute the magnitude of movement_vec
      const mag = Math.hypot(movement_vec.x, movement_vec.y);

      // Determine how many sub-steps we need
      const steps = Math.ceil(mag / MAX_UNITS);

      // Compute the per-step vector
      const step_vec = {
        x: movement_vec.x / steps,
        y: movement_vec.y / steps,
      };
      console.log("Steps:",steps);
      let col_time_slice = null;
      let temp_pos = { ...this.pos };

      for (let i = 0; i < steps; i++) {
        col_time_slice = this.checkSegmentCollision(
          paddle.segment[0]!,
          paddle.segment[1]!,
          paddle.lastMovement,
          temp_pos,
          step_vec,
          effective_radius
        );

        // Update temporary position along the step vector
        temp_pos.x += step_vec.x;
        temp_pos.y += step_vec.y;

        // Stop early if collision detected
        if (col_time_slice !== null) break;
      }
      if (col_time_slice !== null) {
        console.log("timslice 0 1?:", col_time_slice);

        this.dir = scale(-1, this.dir);
        // Handle multiple bounces in one frame, then return
        return;
      }
      // for (const vertex of paddle.segment) {
      //   col_time_slice = this.checkEndpointCollision(
      //     vertex,
      //     paddle.lastMovement,
      //     this.pos,
      //     movement_vec,
      //     this.radius
      //   );
      //   if (col_time_slice !== null) {
      //     this.dir = scale(-1, this.dir);
      //     // Handle multiple bounces in one frame, then return
      //     return;
      //   }
      // }
    }
    if (!(col_time_slice === null)) {
      throw Error("wat");
    }
    this.pos.x += movement_vec.x;
    this.pos.y += movement_vec.y;
  }
}

export default PongBall;
