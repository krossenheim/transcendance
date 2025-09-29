import type { Vec2 } from "./vector2.js";
import { add, sub, crossp, dotp, normalize } from "./vector2.js";
import type PongBall from "pongBall.js";

function getCoefficients(
  c_vel: Vec2,
  e: Vec2,
  w0: Vec2,
  c_radius: number
): [number, number, number] {
  let a = crossp(c_vel, e); // e: relative vector from seg_b to seg_ a
  a *= a;
  const b = 2.0 * crossp(w0, e) * crossp(c_vel, e);
  let c = crossp(w0, e);
  c = c * c - c_radius * c_radius * dotp(c_vel, e);

  return [a, b, c];
}

function getEarliestContactMoment(
  a: number,
  b: number,
  c: number
): number | null {
  const discriminant = b * b - 4 * a * c;
  if (discriminant > 0) {
    const t1 = (-b - Math.sqrt(discriminant)) / (2 * a);
    const t2 = (-b + Math.sqrt(discriminant)) / (2 * a);
    // the sign of a decides if t1 < t2 or t1 > t2
    // point 'goes through' the segment
    return Math.min(t1, t2);
  } else if (discriminant == 0) {
    return -b / (2 * a); // exact intersection at moment time
  }
  // else { IF we want to know distance at closest approach and its moment this is nice.
  //   const closest_approach_moment = -b / (2 * a); // some time segment (0,1)
  //   distance = Math.sqrt(-discriminant) / (2 * a); // distance between at closest approach
  // }
  return null;
}

type hit = {
  alpha: number;
  point: Vec2;
  normal: Vec2;
};

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

  const segments_rel_v = sub(polygon_vel, ball.d);
  for (let i = 1; i < numsides; i++) {
    const seg_a = polygon[i - 1]!; // Ignoring TS warning ;
    const seg_b = polygon[i]!; // ignoring !
    if (polygon_stationary) {
      hit = circleTouchesSegment(ball.pos, ball.d, ball.r, seg_a, seg_b);
    } else {
      const seg_a_rel = sub(seg_a, ball.pos);
      const seg_b_rel = sub(seg_b, ball.pos);
      hit = circleTouchesSegment(
        { x: 0, y: 0 }, // seg_x_rel are combined velocity/movement vectors so now the ball is now pov.
        segments_rel_v, // the combined vectors
        ball.r,
        seg_a_rel, // where seg_a is relative to ball.pos
        seg_b_rel // "" ""
      );
    }
    if (hit) return hit;
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
