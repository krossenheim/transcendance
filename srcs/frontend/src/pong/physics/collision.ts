// Client-side collision detection (mirrors server engine/collision.ts)
import { Vec2, solveQuadratic, EPS } from "./math";

export enum CollisionResponse {
    BOUNCE = 0,
    IGNORE = 1,
    RESET = 2,
}

// Collision detection between circle and line
export function getWallCollisionTime(
    ballCenter: Vec2,
    ballRadius: number,
    ballVelocity: Vec2,
    wallPointA: Vec2,
    wallPointB: Vec2,
    wallVelocity: Vec2 = new Vec2(0, 0)
): number | null {
    const pointRelativeVelocity = ballVelocity.sub(wallVelocity);
    const pointRelativeStart = ballCenter.sub(wallPointA);

    const wallVec = wallPointB.sub(wallPointA);
    let wallNormal = wallVec.perp().normalize();

    if (pointRelativeVelocity.dot(wallNormal) >= -EPS)
        wallNormal = wallNormal.mul(-1);
    const vecAlongNormal = pointRelativeVelocity.dot(wallNormal);

    const distanceToLine = pointRelativeStart.dot(wallNormal);
    const tHit = (ballRadius - distanceToLine) / vecAlongNormal;

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

// Collision detection between two circles
export function getBallCollisionTime(
    ballACenter: Vec2,
    ballARadius: number,
    ballAVelocity: Vec2,
    ballBCenter: Vec2,
    ballBRadius: number,
    ballBVelocity: Vec2
): number | null {
    const pointRelativeStart = ballBCenter.sub(ballACenter);
    const pointRelativeVelocity = ballBVelocity.sub(ballAVelocity);
    const combinedRadius = ballARadius + ballBRadius;

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

// Resolve collision between two circles (elastic collision)
export function resolveBallCollision(
    ballA: { center: Vec2; velocity: Vec2; inverseMass: number; restitution: number },
    ballB: { center: Vec2; velocity: Vec2; inverseMass: number; restitution: number }
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

// Resolve collision between circle and line (bounce off wall)
export function resolveCircleLineCollision(
    ball: { center: Vec2; velocity: Vec2; inverseMass: number; restitution: number },
    wallPointA: Vec2,
    wallPointB: Vec2,
    wallVelocity: Vec2 = new Vec2(0, 0),
    wallInverseMass: number = 0,
    wallRestitution: number = 1.0
): void {
    const wallVec = wallPointB.sub(wallPointA);
    const relativeVelocity = ball.velocity.sub(wallVelocity);

    let wallNormal = wallVec.perp().normalize();
    if (relativeVelocity.dot(wallNormal) > 0) {
        wallNormal = wallNormal.mul(-1);
    }

    const velocityAlongNormal = relativeVelocity.dot(wallNormal);
    const j = -(1 + Math.min(ball.restitution, wallRestitution)) * velocityAlongNormal / (ball.inverseMass + wallInverseMass);

    const impulse = wallNormal.mul(j);
    ball.velocity = ball.velocity.add(impulse.mul(ball.inverseMass));
}
