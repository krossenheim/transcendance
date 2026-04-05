import { solveQuadratic, EPS, Vec2, QUAD_BUFFER } from "./math.js";
import { CircleObject, LineObject } from "./baseObjects.js";

export enum CollisionResponse {
    BOUNCE = 0,
    IGNORE = 1,
    RESET = 2,
};

const scratchRelativeVelocity = new Vec2(0, 0);
const scratchRelativeStart = new Vec2(0, 0);
const scratchWallVec = new Vec2(0, 0);
const scratchNormal = new Vec2(0, 0);
const scratchBallPosAtHit = new Vec2(0, 0);

export function getWallCollisionTime(
    ball: CircleObject,
    wall: LineObject,
) {
    scratchRelativeVelocity.copy(ball.velocity).sub(wall.velocity);
    scratchRelativeStart.copy(ball.center).sub(wall.pointA);

    scratchWallVec.copy(wall.pointB).sub(wall.pointA);
    const wallLenSq = scratchWallVec.lenSq();

    if (wallLenSq < EPS) {
        return null;
    }

    const wallLen = Math.sqrt(wallLenSq);

    scratchNormal.copy(scratchWallVec).perp().normalize();

    if (scratchRelativeVelocity.dot(scratchNormal) >= -EPS)
        scratchNormal.mul(-1);

    const vecAlongNormal = scratchRelativeVelocity.dot(scratchNormal);
    const distanceToLine = scratchRelativeStart.dot(scratchNormal);

    if (Math.abs(vecAlongNormal) >= EPS) {
        const tHit = (ball.radius - distanceToLine) / vecAlongNormal;

        if (tHit >= -EPS) {
            const clampedTHit = Math.max(0, tHit);

            scratchBallPosAtHit.copy(scratchRelativeStart).addScaled(scratchRelativeVelocity, clampedTHit);
            const shadowLength = scratchBallPosAtHit.dot(scratchWallVec) / wallLen;

            if (shadowLength >= -ball.radius && shadowLength <= wallLen + ball.radius) {
                return clampedTHit;
            }
        }
    }

    const projT = wallLenSq > EPS ? Math.max(0, Math.min(1, scratchRelativeStart.dot(scratchWallVec) / wallLenSq)) : 0;
    const dx = scratchRelativeStart.x - scratchWallVec.x * projT;
    const dy = scratchRelativeStart.y - scratchWallVec.y * projT;
    const distToSegmentSq = dx * dx + dy * dy;
    if (distToSegmentSq < ball.radius * ball.radius - EPS) {
        return 0;
    }

    return null;
}

export function getBallCollisionTime(
    ballA: CircleObject,
    ballB: CircleObject,
): number | null {
    scratchRelativeStart.copy(ballB.center).sub(ballA.center);
    scratchRelativeVelocity.copy(ballB.velocity).sub(ballA.velocity);
    const combinedRadius = ballA.radius + ballB.radius;

    const currentDistSq = scratchRelativeStart.lenSq();
    const combinedRadiusSq = combinedRadius * combinedRadius;
    if (currentDistSq < combinedRadiusSq - EPS) {
        return 0;
    }

    const a = scratchRelativeVelocity.lenSq();

    if (a < EPS) {
        return null;
    }

    const b = 2 * scratchRelativeStart.dot(scratchRelativeVelocity);
    const c = currentDistSq - combinedRadiusSq;

    const numRoots = solveQuadratic(a, b, c, QUAD_BUFFER);
    if (numRoots > 0) {
        const t = QUAD_BUFFER[0]!;

        if (t >= -EPS) {
            return Math.max(0, t);
        }
    }

    return null;
}

export function resolveBallCollision(
    ballA: CircleObject,
    ballB: CircleObject,
): void {
    scratchNormal.copy(ballB.center).sub(ballA.center);
    const dist = scratchNormal.len();

    if (dist < EPS) {
        scratchNormal.set(1, 0);
    } else {
        scratchNormal.div(dist);
    }

    scratchRelativeVelocity.copy(ballB.velocity).sub(ballA.velocity);
    const velocityAlongNormal = scratchRelativeVelocity.dot(scratchNormal);

    const combinedRadius = ballA.radius + ballB.radius;
    const overlap = combinedRadius - dist;
    if (overlap > 0) {
        const inverseMassSum = ballA.inverseMass + ballB.inverseMass;
        if (inverseMassSum > 0) {
            const correctionA = overlap * (ballA.inverseMass / inverseMassSum);
            const correctionB = overlap * (ballB.inverseMass / inverseMassSum);
            ballA.center.addScaled(scratchNormal, -correctionA);
            ballB.center.addScaled(scratchNormal, correctionB);
        }
    }

    if (velocityAlongNormal > 0) {
        return;
    }

    const restitution = Math.min(ballA.restitution, ballB.restitution);
    const inverseMassSum = ballA.inverseMass + ballB.inverseMass;
    if (inverseMassSum === 0) {
        return;
    }

    const j = -(1 + restitution) * velocityAlongNormal / inverseMassSum;
    ballA.velocity.addScaled(scratchNormal, -j * ballA.inverseMass);
    ballB.velocity.addScaled(scratchNormal, j * ballB.inverseMass);
}

const scratchAP = new Vec2(0, 0);
const scratchAB = new Vec2(0, 0);
const scratchClosestPoint = new Vec2(0, 0);

export function resolveCircleLineCollision(
    ball: CircleObject,
    wall: LineObject,
): void {
    scratchAB.copy(wall.pointB).sub(wall.pointA);

    scratchAP.copy(ball.center).sub(wall.pointA);

    const lenSq = scratchAB.lenSq();
    const dot = scratchAP.dot(scratchAB);

    const t = lenSq > EPS ? Math.max(0, Math.min(1, dot / lenSq)) : 0;

    scratchClosestPoint.copy(wall.pointA).addScaled(scratchAB, t);

    scratchNormal.copy(ball.center).sub(scratchClosestPoint);

    const distSq = scratchNormal.lenSq();
    const dist = Math.sqrt(distSq);

    if (dist < EPS) {
        scratchNormal.copy(scratchAB).perp().normalize();
    } else {
        scratchNormal.div(dist);
    }

    scratchRelativeVelocity.copy(ball.velocity).sub(wall.velocity);
    const velocityAlongNormal = scratchRelativeVelocity.dot(scratchNormal);

    if (velocityAlongNormal > 0) {
        const overlapEarly = ball.radius - dist;
        if (overlapEarly > 0) {
            ball.center.addScaled(scratchNormal, overlapEarly + 0.5);
        }
        return;
    }

    const overlap = ball.radius - dist;
    if (overlap > 0) {
        ball.center.addScaled(scratchNormal, overlap + 0.5);
    }

    const restitution = Math.min(ball.restitution, wall.restitution);
    const inverseMassSum = ball.inverseMass + wall.inverseMass;

    if (inverseMassSum === 0) return;

    const j = -(1 + restitution) * velocityAlongNormal / inverseMassSum;

    ball.velocity.addScaled(scratchNormal, j * ball.inverseMass);
    wall.velocity.addScaled(scratchNormal, -j * wall.inverseMass);

    // Deterministic perturbation based on ball position to avoid degenerate bouncing
    const perturbSeed = (ball.center.x * 7.3 + ball.center.y * 13.7) % 1.0;
    const perturbAngle = (perturbSeed - 0.5) * 0.1;
    const cos = Math.cos(perturbAngle);
    const sin = Math.sin(perturbAngle);
    const vx = ball.velocity.x;
    const vy = ball.velocity.y;
    ball.velocity.x = vx * cos - vy * sin;
    ball.velocity.y = vx * sin + vy * cos;
}

