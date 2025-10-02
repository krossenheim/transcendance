import type PlayerPaddle from "playerPaddle.js";
import type { Vec2 } from "./vector2.js";
import { is_zero, normalize, sub, len2, dotp, len, scale } from "./vector2.js";
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
  if (a < 1e-6) {
    return null;
  }

  const discriminant = b * b - 4 * a * c;

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

  constructor(start_pos: Vec2, game_size: Vec2, speed = 40) {
    this.game_size = game_size;
    this.pos = { ...start_pos };
    this.radius = 15;
    const r = randomAvoidAxes();
    this.speed = speed;
    this.dir = normalize({ x: Math.cos(r), y: Math.sin(r) });
  }

  getMove(deltaFactor: number): Vec2 {
    this.pos.x += this.dir.x * deltaFactor * this.speed;
    this.pos.y += this.dir.y * deltaFactor * this.speed;
    const wantedMove = {
      x: this.dir.x * deltaFactor * this.speed,
      y: this.dir.x * deltaFactor * this.speed,
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
    if (len(diff) <= effectiveRadius + 1e-6) return null;
    const a = dotp(movementRel, movementRel);
    if (a < +1e-6) return null;
    const b = -2 * dotp(movementRel, diff);
    const c = dotp(diff, diff) - effectiveRadius * effectiveRadius;

    const t = solveQuadratic(a, b, c); // Only returns tmin even if disc > 0
    if (t === null) return null;
    if (t < 0 || t > 1) return null;
    return t;
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

    for (const paddle of paddles) {
      const effective_radius = this.radius + paddle.width; // effective radius
      for (const vertex of paddle.segment) {
        const col_time_slice = this.checkEndpointCollision(
          vertex,
          paddle.lastMovement,
          this.pos,
          movement_vec,
          effective_radius
        );
        if (col_time_slice === null) continue;
        // const can_move_up_to = scale(col_time_slice, movement_vec);
        // this.pos.x += can_move_up_to.x;
        // this.pos.y += can_move_up_to.y;
        this.dir = scale(-1, this.dir);

        //Now within range of effective radius between circle center and vertex.
      }
    }
  }
}

export default PongBall;
