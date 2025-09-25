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

