export type Vec2 = {
  x: number;
  y: number;
};

export function normalize(v: Vec2): Vec2 {
  const len = Math.hypot(v.x, v.y);
  return len === 0 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len };
}

export function scale(factor: number, vector: Vec2): Vec2 {
  return { x: vector.x * factor, y: vector.y * factor };
}

export function toward(from: Vec2, to: Vec2): Vec2 {
  return normalize({ x: to.x - from.x, y: to.y - from.y });
}

export function rotate(vec: Vec2, angle: number): Vec2 {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  return {
    x: vec.x * cosA - vec.y * sinA,
    y: vec.x * sinA + vec.y * cosA,
  };
}

export function getAngle(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.atan2(dy, dx);
}

export function add(a: Vec2, b: Vec2): Vec2 {
  const dx = b.x + a.x;
  const dy = (b.y = a.y);
  return { x: dy, y: dx };
}

export function multiply(a: Vec2, n: number): Vec2 {
  const dx = n * a.x;
  const dy = n * a.y;
  return { x: dy, y: dx };
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return { x: dy, y: dx };
}

export function crossp(a: Vec2, b: Vec2) {
  return a.x * b.y - a.y * b.x;
}

export function dotp(a: Vec2, b: Vec2) {
  return a.x * b.x + a.y * b.y;
}
