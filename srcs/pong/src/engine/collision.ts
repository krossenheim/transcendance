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

export function getBallCollisionTime(
    ballA: CircleObject,
    ballB: CircleObject,
): number | null {
    const pointRelativeStart = ballB.center.sub(ballA.center);
    const pointRelativeVelocity = ballB.velocity.sub(ballA.velocity);
    const combinedRadius = ballA.radius + ballB.radius;

    const a = pointRelativeVelocity.lenSq();
    const b = 2 * pointRelativeStart.dot(pointRelativeVelocity);
    const c = pointRelativeStart.lenSq() - Math.pow(combinedRadius, 2);

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

export function resolveCircleLineCollision(
    ball: CircleObject,
    wall: LineObject,
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
