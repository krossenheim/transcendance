// Shared collision detection - used by both frontend and backend
import { Vec2, solveQuadratic, EPS } from "./math.js";

export enum CollisionResponse {
    BOUNCE = 0,
    IGNORE = 1,
    RESET = 2,
}

// Generic interfaces for collision objects
export interface ICircle {
    center: Vec2;
    radius: number;
    velocity: Vec2;
    inverseMass: number;
    restitution: number;
}

export interface ILine {
    pointA: Vec2;
    pointB: Vec2;
    velocity: Vec2;
    inverseMass: number;
    restitution: number;
}

/**
 * Calculate collision time between a circle and a line segment
 */
export function getWallCollisionTime(
    ball: ICircle,
    wall: ILine,
): number | null {
    const pointRelativeVelocity = ball.velocity.sub(wall.velocity);
    const pointRelativeStart = ball.center.sub(wall.pointA);

    const wallVec = wall.pointB.sub(wall.pointA);
    let wallNormal = wallVec.perp().normalize();

    if (pointRelativeVelocity.dot(wallNormal) >= -EPS)
        wallNormal = wallNormal.mul(-1);
    const vecAlongNormal = pointRelativeVelocity.dot(wallNormal);

    const distanceToLine = pointRelativeStart.dot(wallNormal);
    const tHit = (ball.radius - distanceToLine) / vecAlongNormal;

    if (tHit < 0) {
        return null;
    }

    const ballPosAtHit = pointRelativeStart.add(pointRelativeVelocity.mul(tHit));
    const shadowLengthSq = ballPosAtHit.dot(wallVec);
    const segmentT = shadowLengthSq / wallVec.dot(wallVec);

    if (segmentT < 0 || segmentT > 1) {
        return null;
    }

    return tHit;
}

/**
 * Calculate collision time between two circles
 */
export function getBallCollisionTime(
    ballA: ICircle,
    ballB: ICircle,
): number | null {
    const pointRelativeStart = ballB.center.sub(ballA.center);
    const pointRelativeVelocity = ballB.velocity.sub(ballA.velocity);
    const combinedRadius = ballA.radius + ballB.radius;

    const a = pointRelativeVelocity.lenSq();
    const b = 2 * pointRelativeStart.dot(pointRelativeVelocity);
    const c = pointRelativeStart.lenSq() - Math.pow(combinedRadius, 2);

    const roots = solveQuadratic(a, b, c);
    if (roots.length > 0) {
        const t = roots[0]!;

        if (t >= -EPS && t <= 1 + EPS) {
            return t;
        }
    }

    return null;
}

/**
 * Resolve elastic collision between two circles
 * Modifies velocity of both balls in place
 */
export function resolveBallCollision(
    ballA: ICircle,
    ballB: ICircle,
): void {
    const normal = ballB.center.sub(ballA.center).normalize();
    const relativeVelocity = ballB.velocity.sub(ballA.velocity);
    const velocityAlongNormal = relativeVelocity.dot(normal);

    if (velocityAlongNormal > 0) {
        return;
    }

    const j = -(1 + Math.min(ballA.restitution, ballB.restitution)) * velocityAlongNormal / (ballA.inverseMass + ballB.inverseMass);

    const impulse = normal.mul(j);
    ballA.velocity = ballA.velocity.sub(impulse.mul(ballA.inverseMass));
    ballB.velocity = ballB.velocity.add(impulse.mul(ballB.inverseMass));
}

/**
 * Resolve collision between a circle and a line (bounce off wall)
 * Modifies velocity of ball (and wall if it has mass) in place
 */
export function resolveCircleLineCollision(
    ball: ICircle,
    wall: ILine,
): void {
    const wallVec = wall.pointB.sub(wall.pointA);
    const relativeVelocity = ball.velocity.sub(wall.velocity);

    let wallNormal = wallVec.perp().normalize();
    if (relativeVelocity.dot(wallNormal) > 0) {
        wallNormal = wallNormal.mul(-1);
    }

    const velocityAlongNormal = relativeVelocity.dot(wallNormal);
    const j = -(1 + Math.min(ball.restitution, wall.restitution)) * velocityAlongNormal / (ball.inverseMass + wall.inverseMass);

    const impulse = wallNormal.mul(j);
    ball.velocity = ball.velocity.add(impulse.mul(ball.inverseMass));
    wall.velocity = wall.velocity.sub(impulse.mul(wall.inverseMass));
}
