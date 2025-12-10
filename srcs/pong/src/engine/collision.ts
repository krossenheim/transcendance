import { CircleObject, LineObject } from "./baseObjects.js";
import { solveQuadratic, EPS } from "./math.js";

export enum CollisionResponse {
    BOUNCE = 0,
    IGNORE = 1,
    RESET = 2,
};

export function getWallCollisionTime(
    ball: CircleObject,
    wall: LineObject,
) {
    // relative velocity components (avoid temporary Vec2 allocations)
    const rvx = ball.velocity.x - wall.velocity.x;
    const rvy = ball.velocity.y - wall.velocity.y;

    // relative start position of ball center to wall.pointA
    const sx = ball.center.x - wall.pointA.x;
    const sy = ball.center.y - wall.pointA.y;

    // wall vector
    const wx = wall.pointB.x - wall.pointA.x;
    const wy = wall.pointB.y - wall.pointA.y;
    const wallLenSq = wx * wx + wy * wy;
    if (wallLenSq <= EPS) return null;

    const wallLen = Math.sqrt(wallLenSq);

    // unit normal to wall (perp of wall vector)
    let nx = -wy / wallLen;
    let ny = wx / wallLen;

    // ensure normal faces opposite to relative velocity
    const relDot = rvx * nx + rvy * ny;
    if (relDot >= -EPS) {
        nx = -nx;
        ny = -ny;
    }

    const vecAlongNormal = rvx * nx + rvy * ny;
    if (Math.abs(vecAlongNormal) < EPS) return null;

    const distanceToLine = sx * nx + sy * ny;
    const tHit = (ball.radius - distanceToLine) / vecAlongNormal;
    if (tHit < 0) return null;

    const bx = sx + rvx * tHit;
    const by = sy + rvy * tHit;

    const shadowLengthSq = bx * wx + by * wy;
    const segmentT = shadowLengthSq / wallLenSq;
    if (segmentT < 0 || segmentT > 1) return null;

    return tHit;
}

export function getBallCollisionTime(
    ballA: CircleObject,
    ballB: CircleObject,
): number | null {
    const sx = ballB.center.x - ballA.center.x;
    const sy = ballB.center.y - ballA.center.y;
    const rvx = ballB.velocity.x - ballA.velocity.x;
    const rvy = ballB.velocity.y - ballA.velocity.y;
    const combinedRadius = ballA.radius + ballB.radius;

    const a = rvx * rvx + rvy * rvy;
    const b = 2 * (sx * rvx + sy * rvy);
    const c = sx * sx + sy * sy - combinedRadius * combinedRadius;

    const roots = solveQuadratic(a, b, c);
    if (roots.length > 0) {
        const t = roots[0]!

        if (t >= -EPS && t <= 1 + EPS) {
            return t;
        }
    }

    return null;
}

export function resolveBallCollision(
    ballA: CircleObject,
    ballB: CircleObject,
): void {
    // normal from A to B
    const dx = ballB.center.x - ballA.center.x;
    const dy = ballB.center.y - ballA.center.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= EPS) return;
    const dist = Math.sqrt(distSq);
    const nx = dx / dist;
    const ny = dy / dist;

    const rvx = ballB.velocity.x - ballA.velocity.x;
    const rvy = ballB.velocity.y - ballA.velocity.y;
    const velocityAlongNormal = rvx * nx + rvy * ny;

    if (velocityAlongNormal > 0) return;

    const j = -(1 + Math.min(ballA.restitution, ballB.restitution)) * velocityAlongNormal / (ballA.inverseMass + ballB.inverseMass);

    const jnx = nx * j;
    const jny = ny * j;

    const va = ballA.velocity;
    const vb = ballB.velocity;
    va.x = va.x - jnx * ballA.inverseMass;
    va.y = va.y - jny * ballA.inverseMass;
    vb.x = vb.x + jnx * ballB.inverseMass;
    vb.y = vb.y + jny * ballB.inverseMass;
}

export function resolveCircleLineCollision(
    ball: CircleObject,
    wall: LineObject,
): void {
    const wx = wall.pointB.x - wall.pointA.x;
    const wy = wall.pointB.y - wall.pointA.y;
    const wallLenSq = wx * wx + wy * wy;
    if (wallLenSq <= EPS) return;
    const wallLen = Math.sqrt(wallLenSq);

    const rvx = ball.velocity.x - wall.velocity.x;
    const rvy = ball.velocity.y - wall.velocity.y;

    let nx = -wy / wallLen;
    let ny = wx / wallLen;
    if (rvx * nx + rvy * ny > 0) {
        nx = -nx;
        ny = -ny;
    }

    const velocityAlongNormal = rvx * nx + rvy * ny;
    const j = -(1 + Math.min(ball.restitution, wall.restitution)) * velocityAlongNormal / (ball.inverseMass + wall.inverseMass);

    const jnx = nx * j;
    const jny = ny * j;

    const vb = ball.velocity;
    vb.x = vb.x + jnx * ball.inverseMass;
    vb.y = vb.y + jny * ball.inverseMass;

    const vw = wall.velocity;
    vw.x = vw.x - jnx * wall.inverseMass;
    vw.y = vw.y - jny * wall.inverseMass;
}
