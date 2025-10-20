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
  crossp,
} from "./vector2.js";

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

type Hit = {
  normal: Vec2;
  pos: Vec2;
  alpha: number;
};

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
    this.lastCollidedWith = null; // more of a debug attribute can remove soon
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
    ballPos: Vec2,
    A: Vec2,
    B: Vec2,
    segment_movement: Vec2,
    ballMovement: Vec2,
    effectiveRadius: number,
    segment_width: number
  ): Hit | null {
    const movementRel = sub(ballMovement, segment_movement);

    const AB = sub(B, A);
    const AB_len2 = dotp(AB, AB);
    if (AB_len2 < 1e-8) return null;

    const AP = sub(ballPos, A);
    const t_seg = Math.max(0, Math.min(1, dotp(AP, AB) / AB_len2));
    const closest = add(A, scale(t_seg, AB)); // closest point on AB at t=0

    const diff = sub(ballPos, closest);
    const dist2 = dotp(diff, diff);

    if (dist2 <= effectiveRadius * effectiveRadius) {
      const normal = normalize(diff);
      return {
        normal,
        pos: closest,
        alpha: 0,
      };
    }

    // Quadratic terms
    const a = dotp(movementRel, movementRel);
    if (a < 1e-8) return null;

    let b = -2 * dotp(movementRel, diff);
    let c = dotp(diff, diff) - effectiveRadius * effectiveRadius;
    const t = solveQuadratic(a, b, c);

    if (t === null || t < 0 || t > 1) return null;

    const hitPos = add(ballPos, scale(t, ballMovement));
    const A_t = add(A, scale(t, segment_movement));
    const B_t = add(B, scale(t, segment_movement));
    const AB_t = sub(B_t, A_t);
    const proj = dotp(sub(hitPos, A_t), AB_t) / dotp(AB_t, AB_t);
    const closestAtT = add(A_t, scale(Math.max(0, Math.min(1, proj)), AB_t));
    let normal = normalize(sub(hitPos, closestAtT));
    if (dotp(normal, sub(ballPos, closestAtT)) < 0) normal = scale(-1, normal);
    if (proj >= 0 && proj <= 1) {
      const hitPos = add(ballPos, scale(t, ballMovement));
      const normal = normalize(sub(hitPos, closestAtT));
      return {
        normal,
        pos: hitPos,
        alpha: t,
      };
    }

    // Handle short edge collisions
    if (
      (proj > 1 && proj <= effectiveRadius) ||
      (proj >= -effectiveRadius && proj < 0)
    ) {
      const B_or_A = proj < 0.5 ? A : B;
      const normal = normalize(sub(ballPos, B_or_A));
      const corner = add(B_or_A, scale(segment_width / 2, normal));
      const cornerRel = sub(ballPos, corner);

      b = -2 * dotp(movementRel, cornerRel);
      c = dotp(cornerRel, cornerRel) - effectiveRadius * effectiveRadius;
      const t_to_corner = solveQuadratic(a, b, c);

      if (t_to_corner === null) return null;

      const alpha = t + t_to_corner;
      if (alpha < 0 || alpha > 1) return null;

      const hitPos = add(ballPos, scale(alpha, ballMovement));
      const hitNormal = normalize(sub(hitPos, corner));
      return {
        normal: hitNormal,
        pos: hitPos,
        alpha,
      };
    }

    return null;
  }

  getBounce(hit: Hit): Vec2 {
    const n = normalize(hit.normal);
    const d = this.dir;

    // Reflect direction across the normal
    const dot = dotp(d, n);
    const reflected = sub(d, scale(2 * dot, n));

    return normalize(reflected);
  }

  movePaddleAware(movement_vec: Vec2, paddles: PlayerPaddle[]) {
    // 1.  Check each end of the paddle segment, to see if distance from circle_center to seg_a/seg_b < circle_radius + paddle.width
    // 2.  Check if the point's projection falls within seg_a and seg_b (90 degrees). If so, check distance from circle_center to seg_a/seg_b < circle_radius + paddle.width

    let hit: null | Hit = null;

    for (const paddle of paddles) {
      if (this.lastCollidedWith === paddle) continue;
      const effective_radius = this.radius + paddle.width / 2;
      hit = this.checkSegmentCollision(
        this.pos,
        paddle.segment[0]!,
        paddle.segment[1]!,
        paddle.lastMovement,
        movement_vec,
        effective_radius,
        paddle.width
      );

      if (hit !== null) {
        this.lastCollidedWith = paddle;
        this.dir = this.getBounce(hit);
        if (hit.alpha > 0) {
          const ballRadius = this.radius;
          const paddleHalfWidth = paddle.width ? paddle.width * 0.5 : 0;
          const totalSeparation = ballRadius + paddleHalfWidth;
          this.pos = add(hit.pos, scale(totalSeparation, hit.normal));
        }
        return;
      }
    }

    if (!(hit === null)) {
      throw Error("wat");
    }
    this.pos = add(this.pos, movement_vec);
  }
}

export default PongBall;
