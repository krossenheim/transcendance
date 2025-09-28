import type PlayerPaddle from "playerPaddle.js";
import type { Vec2 } from "./utils/api/service/common/vector2.js";
import {
  add,
  multiply,
  sub,
  crossp,
  dotp,
  scale,
  normalize,
} from "./utils/api/service/common/vector2.js";
import type PongBall from "pongBall.js";
import { number } from "zod";
import { dot } from "node:test/reporters";
import { close } from "fs";
// import { scale, normalize, toward } from "./utils/api/service/common/vector2.js";

// function checkSphereCollidesWithSegment(ball: PongBall, a: Vec2, b: Vec2) {

//   Segment endpoints: A, B (2D vectors).
// Circle center start: P0 (2D).
// Movement vector: v (2D, already scaled by Δt).
// Radius: r.
// Time parameter α ∈ [0,1] along movement (position at time α is P(α) = P0 + v α).
// Let e = B - A and ee = e·e (squared length). Let w0 = P0 - A.

// function pointLocOverTime(
//   time_fragment: number,
//   circle_startpos: Vec2,
//   circle_vel: Vec2
// ): Vec2 {
//   // alpha: 0 to 1
//   const ans = add(circle_startpos, multiply(circle_vel, time_fragment));
//   return ans;
// }

// function checkIntersectsPolygon(
//   ball: PongBall,
//   a: Vec2,
//   b: Vec2,
//   segment_vel: Vec2
// ) {
//   const ballpos_rel = add(sub(), sub());

//   1. Represent the motion
// Circle: P_c(α) = P0_c + v_c * α
// Segment endpoints:
// A(α) = A0 + v_A * α
// B(α) = B0 + v_B * α
// Here, α ∈ [0,1] is still the normalized fraction along the timestep.
// }

// int solve_quadratic(double a, double b, double c, double* t0, double* t1) {
//     double disc = b*b - 4*a*c;
//     if (disc < 0) return 0;
//     double sqrt_disc = sqrt(disc);
//     *t0 = (-b - sqrt_disc) / (2*a);
//     *t1 = (-b + sqrt_disc) / (2*a);
//     return 1;
// }

function solve_quadratic(
  a: number,
  b: number,
  c: number
): { t0: number; t1: number } | false {
  return false;
}

type hit = {
  alpha: number;
  normal: Vec2;
};
//P0,v,r,A,B,&alpha_edge,&n_edge

function circleTouchesSegment(
  c_start_pos: Vec2,
  c_vel: Vec2,
  c_radius: number,
  seg_a: Vec2,
  seg_b: Vec2
): hit | false {
  const e: Vec2 = sub(seg_b, seg_a);
  const w0: Vec2 = sub(c_start_pos, seg_a);

  let a = crossp(c_vel, e);
  a *= a;
  const b = 2.0 * crossp(w0, e) * crossp(c_vel, e);
  let c = crossp(w0, e);
  c = c * c - c_radius * c_radius * dotp(c_vel, e);

  const solved = solve_quadratic(a, b, c);
  if (!solved) return false;
  const { t0, t1 } = solved;
  let alpha_candidate;
  if (t0 >= 0 && t0 <= 1) {
    alpha_candidate = t0;
  } else if (t1 >= 0 && t1 <= 1) {
    alpha_candidate = t1;
  } else {
    return false;
  }

  const clamp = (v: number, min: number, max: number) =>
    Math.min(Math.max(v, min), max);

  const alpha_edge = clamp(
    dotp(sub(add(c_start_pos, scale(alpha_candidate, c_vel)), seg_a), e) /
      dotp(e, e),
    0,
    1
  );

  const closest: Vec2 = add(seg_a, scale(alpha_edge, e));
  return {
    normal: normalize(
      sub(add(c_start_pos, scale(alpha_candidate, c_vel)), closest)
    ),
    alpha: alpha_candidate,
  };
}
// // Swept circle vs segment (stationary)
// int swept_circle_segment(Vec2 P0, Vec2 v, double r,
//                          Vec2 A, Vec2 B,
//                          double* alpha, Vec2* normal) {
//     Vec2 e = vec_sub(B, A);
//     Vec2 w0 = vec_sub(P0, A);

//     double a = vec_cross(v, e);
//     a *= a;
//     double b = 2.0 * vec_cross(w0, e) * vec_cross(v, e);
//     double c = vec_cross(w0, e);
//     c = c*c - r*r * vec_dot(e,e);

//     double t0, t1;
//     if (!solve_quadratic(a,b,c,&t0,&t1)) return 0;

//     double alpha_candidate = -1;
//     if (t0 >= 0 && t0 <= 1) alpha_candidate = t0;
//     else if (t1 >=0 && t1 <=1) alpha_candidate = t1;
//     else return 0;

//     // Compute closest point on segment for normal
//     double t_seg = vec_dot(vec_sub(vec_add(P0, vec_scale(v, alpha_candidate)), A), e) / vec_dot(e,e);
//     if (t_seg < 0) t_seg = 0;
//     if (t_seg > 1) t_seg = 1;

//     Vec2 closest = vec_add(A, vec_scale(e, t_seg));
//     *normal = vec_normalize(vec_sub(vec_add(P0, vec_scale(v, alpha_candidate)), closest));
//     *alpha = alpha_candidate;
//     return 1;
// }

//     if(swept_circle_polygon(P0,v,r,polygon,4,&alpha,&n)){
function circleTouchesPolygon(
  c_start_pos: Vec2,
  c_vel: Vec2,
  polygon: Vec2[],
  c_radius: number
) {
  let hit = false;
  let alpha_min = 1e9;
  let normal_min: Vec2 = { x: 0, y: 0 };

  const polygon_vertices = polygon.length;
  if (polygon_vertices < 2)
    throw Error("Please read the user manual before operating this machine.");
  for (let i = 1; i < polygon_vertices; i++) {
    let a = polygon[i - 1]!; // Tell typescript its fine. No undefined here.
    let b = polygon[i]!;

    let hitOrFalse: hit | false = circleTouchesSegment(
      c_start_pos,
      c_vel,
      c_radius,
      a,
      b
    );
    if (hitOrFalse !== false) {
      if (hitOrFalse.alpha < alpha_min) {
        alpha_min = hitOrFalse.alpha;
        normal_min = hitOrFalse.normal;
        hit = true;
      }
    }
  }
  if (hit) {
    return hit;
  }
}

// // Polygon sweep: vertices[] of size n
// int swept_circle_polygon(Vec2 P0, Vec2 v, double r, Vec2* vertices, int n,
//                          double* alpha, Vec2* normal) {
//     int hit = 0;
//     double alpha_min = 1e9;
//     Vec2 normal_min = {0,0};

//     for(int i=0;i<n;i++){
//         Vec2 A = vertices[i];
//         Vec2 B = vertices[(i+1)%n];

//         double alpha_edge;
//         Vec2 n_edge;
//         if(swept_circle_segment(P0,v,r,A,B,&alpha_edge,&n_edge)){
//             if(alpha_edge < alpha_min){
//                 alpha_min = alpha_edge;
//                 normal_min = n_edge;
//                 hit = 1;
//             }
//         }
//     }
//     if(hit){
//         *alpha = alpha_min;
//         *normal = normal_min;
//     }
//     return hit;
// }

// // Example usage
// int main() {
//     Vec2 polygon[4] = {{0,0},{5,0},{5,5},{0,5}}; // square
//     Vec2 P0 = {2,-1};
//     Vec2 v = {0,3};  // already factored by timestep
//     double r = 0.5;
//     double alpha;
//     Vec2 n;

//     if(swept_circle_polygon(P0,v,r,polygon,4,&alpha,&n)){
//         Vec2 collision = vec_add(P0, vec_scale(v,alpha));
//         printf("Collision at α=%.3f, position=(%.3f,%.3f), normal=(%.3f,%.3f)\n",
//                alpha, collision.x, collision.y, n.x, n.y);
//     } else {
//         printf("No collision\n");
//     }
// }
