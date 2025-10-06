import PlayerPaddle from "./playerPaddle.js";
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

type Collision = {
  alpha: number;
  normal: Vec2;
};

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
  public lastCollidedWith: null | PlayerPaddle; // direction and rotation don't change on the fly

  private static debugcountstatic: number = 0;
  constructor(start_pos: Vec2, game_size: Vec2, speed = 300) {
    this.lastCollidedWith = null;
    this.game_size = game_size;
    this.id = PongBall.debugcountstatic++;
    this.pos = { ...start_pos };
    this.radius = 18;
    const r = randomAvoidAxes();
    this.speed = speed;
    this.dir = normalize({ x: Math.cos(r), y: Math.sin(r) });
  }

  getMove(deltaFactor: number): Vec2 {
    const wantedMove = {
      x: this.dir.x * deltaFactor * this.speed,
      y: this.dir.y * deltaFactor * this.speed,
    };
    if (is_zero(wantedMove)) {
      throw Error("Ball speed is zero this isn't expected.");
    }
    return wantedMove;
  }

  checkSegmentCollision(
    // A: Vec2,
    // B: Vec2,
    // paddleMovement: Vec2,
    paddle: PlayerPaddle,
    ballPos: Vec2,
    ballMovement: Vec2,
    effectiveRadius: number
  ): number | null {
    const A = paddle.segment[0]!;
    const B = paddle.segment[1]!;
    const paddleMovement = paddle.lastMovement;
    const movementRel = sub(paddleMovement, ballMovement); // relative movement

    const AB = sub(B, A);
    const AB_len2 = dotp(AB, AB);
    if (AB_len2 < 1e-8) {
      // Should throw really.
      return null;
    }

    const AP = sub(ballPos, A);

    // Project AP onto AB, clamped to segment
    const t_seg = Math.max(0, Math.min(1, dotp(AP, AB) / AB_len2));
    const closest = add(A, scale(t_seg, AB)); // closest point on AB at t=0
    // SCALE(T_SEG,AB ) =
    // Now treat as vertex collision with closest point
    const diff = sub(ballPos, closest);
    const dist2 = dotp(diff, diff); // 5? 25

    if (dist2 <= effectiveRadius * effectiveRadius) {
      // Already overlapping at t = 0
      return -1;
    }

    // Get quadratic terms
    const a = dotp(movementRel, movementRel);
    if (a < 1e-8) return null;
    let b = -2 * dotp(movementRel, diff);
    let c = dotp(diff, diff) - effectiveRadius * effectiveRadius;
    const t = solveQuadratic(a, b, c);

    if (t === null) return null;
    if (t < 0 || t > 1) return null;
    // Optional: check that at collision time, the point is still within segment
    const closestAtT = add(closest, scale(t, movementRel));
    const proj = dotp(sub(closestAtT, A), AB) / AB_len2;
    // "Shadow of sub(closestat,a) on ab"

    if (proj >= 0 && proj <= 1) {
      return t;
    }
    // Check if it hits short faces of the rectangle
    if (
      (proj > 1 && proj <= this.radius) ||
      (proj >= -this.radius && proj < 0)
    ) {
      const is_either_side: boolean | null =
        dotp(A, ballPos) === 0 ? null : dotp(A, ballPos) > 0;

      if (is_either_side === null) {
        // perfectly aligned with AB, so certain bounce at t.
        return t;
      }
      // left? right? who needs that, its either side:
      const B_or_A = proj < 0.5 ? A : B;
      const front_of_paddle = dotp(ballPos, paddle.d) > 0;
      const direction = front_of_paddle ? scale(-1, paddle.d) : paddle.d;
      const corner = add(B_or_A, scale(paddle.width / 2, direction));
      const cornerRel = sub(ballPos, corner);
      b = -2 * dotp(movementRel, cornerRel);
      c = dotp(cornerRel, cornerRel) - this.radius * this.radius;
      const t_to_corner = solveQuadratic(a, b, c);
      if (t_to_corner === null) return null; // Didnt hit the corner
      return t + t_to_corner;
    }
    return null;
  }

  getBounceDir(paddle: PlayerPaddle): Vec2 {
    const newdir = normalize(sub(this.pos, paddle.pos));

    // Reflect ball along chosen normal
    const bounced: Vec2 = {
      x: this.dir.x - 2 * dotp(this.dir, newdir) * newdir.x,
      y: this.dir.y - 2 * dotp(this.dir, newdir) * newdir.y,
    };

    return bounced;
  }

  movePaddleAware(movement_vec: Vec2, paddles: PlayerPaddle[]) {
    // 1.  Check each end of the paddle segment, to see if distance from circle_center to seg_a/seg_b < circle_radius + paddle.width
    // 2.  Check if the point's projection falls within seg_a and seg_b (90 degrees). If so, check distance from circle_center to seg_a/seg_b < circle_radius + paddle.width

    let col_time_slice: null | number = null;

    for (const paddle of paddles) {
      if (this.lastCollidedWith === paddle) continue;
      const effective_radius = this.radius + paddle.width / 2;
      col_time_slice = this.checkSegmentCollision(
        paddle,
        this.pos,
        movement_vec,
        effective_radius
      );

      if (col_time_slice !== null) {
        this.lastCollidedWith = paddle;
        this.dir = this.getBounceDir(paddle);
        if (col_time_slice === -1) {
          this.pos.x -= movement_vec.x;
          this.pos.y -= movement_vec.y;
        }
        // Handle multiple bounces in one frame, then return
        return;
      }
    }

    if (!(col_time_slice === null)) {
      throw Error("wat");
    }
    this.pos.x += movement_vec.x;
    this.pos.y += movement_vec.y;
  }
}

export default PongBall;
