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
const scratchPenetrationCheck = new Vec2(0, 0);
const scratchPenetrationToBall = new Vec2(0, 0);

/**
 * Calculate collision time between a circle and a line segment.
 * Returns 0 if already penetrating (immediate collision), or the time until collision.
 * Also checks collision with segment endpoints to prevent corner tunneling.
 */
export function getWallCollisionTime(
    ball: CircleObject,
    wall: LineObject,
) {
    scratchRelativeVelocity.copy(ball.velocity).sub(wall.velocity);
    scratchRelativeStart.copy(ball.center).sub(wall.pointA);

    scratchWallVec.copy(wall.pointB).sub(wall.pointA);
    const wallLenSq = scratchWallVec.lenSq();
    
    // Avoid zero-length walls
    if (wallLenSq < EPS) {
        return null;
    }
    
    const wallLen = Math.sqrt(wallLenSq);
    
    // Check if ball is already penetrating the wall segment
    const projT = scratchRelativeStart.dot(scratchWallVec) / wallLenSq;
    const clampedT = Math.max(0, Math.min(1, projT));
    scratchPenetrationCheck.copy(scratchWallVec).mul(clampedT);
    scratchPenetrationToBall.copy(scratchRelativeStart).sub(scratchPenetrationCheck);
    const distToSegment = scratchPenetrationToBall.len();
    
    // If ball is already penetrating the segment, return immediate collision (t=0)
    if (distToSegment < ball.radius - EPS) {
        return 0; // Immediate collision - ball is inside
    }
    
    // Get wall normal
    scratchNormal.copy(scratchWallVec).perp().normalize();

    // Choose the normal that faces the ball's approach direction
    if (scratchRelativeVelocity.dot(scratchNormal) >= -EPS)
        scratchNormal.mul(-1);
    
    const vecAlongNormal = scratchRelativeVelocity.dot(scratchNormal);
    const distanceToLine = scratchRelativeStart.dot(scratchNormal);
    
    let tHitSegment: number | null = null;
    
    // Check collision with the infinite line (if not moving parallel)
    if (Math.abs(vecAlongNormal) >= EPS) {
        const tHit = (ball.radius - distanceToLine) / vecAlongNormal;
        
        if (tHit >= -EPS) {
            const clampedTHit = Math.max(0, tHit);
            
            // Check if hit point is within segment bounds
            scratchBallPosAtHit.copy(scratchRelativeStart).addScaled(scratchRelativeVelocity, clampedTHit);
            const shadowLength = scratchBallPosAtHit.dot(scratchWallVec) / wallLen;
            
            // Allow small margin for numerical precision
            if (shadowLength >= -ball.radius && shadowLength <= wallLen + ball.radius) {
                tHitSegment = clampedTHit;
            }
        }
    }
    
    // Also check collision with segment endpoints (prevents corner tunneling at steep angles)
    // This treats each endpoint as a point (circle with radius 0) that the ball can hit
    const tHitEndpointA = getCirclePointCollisionTime(ball, wall.pointA, wall.velocity);
    const tHitEndpointB = getCirclePointCollisionTime(ball, wall.pointB, wall.velocity);
    
    // Return the earliest valid collision
    let earliest: number | null = null;
    
    if (tHitSegment !== null && (earliest === null || tHitSegment < earliest)) {
        earliest = tHitSegment;
    }
    if (tHitEndpointA !== null && (earliest === null || tHitEndpointA < earliest)) {
        earliest = tHitEndpointA;
    }
    if (tHitEndpointB !== null && (earliest === null || tHitEndpointB < earliest)) {
        earliest = tHitEndpointB;
    }
    
    return earliest;
}

/**
 * Calculate collision time between a circle and a point (circle with radius 0).
 * Used for detecting collisions with wall endpoints/corners.
 */
function getCirclePointCollisionTime(
    ball: CircleObject,
    point: Vec2,
    pointVelocity: Vec2,
): number | null {
    // Relative position and velocity
    const relPosX = ball.center.x - point.x;
    const relPosY = ball.center.y - point.y;
    const relVelX = ball.velocity.x - pointVelocity.x;
    const relVelY = ball.velocity.y - pointVelocity.y;
    
    // Check if already penetrating
    const distSq = relPosX * relPosX + relPosY * relPosY;
    const radiusSq = ball.radius * ball.radius;
    if (distSq < radiusSq - EPS) {
        return 0; // Already penetrating
    }
    
    // Solve quadratic: |relPos + t*relVel|^2 = radius^2
    const a = relVelX * relVelX + relVelY * relVelY;
    if (a < EPS) {
        return null; // Not moving relative to point
    }
    
    const b = 2 * (relPosX * relVelX + relPosY * relVelY);
    const c = distSq - radiusSq;
    
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) {
        return null; // No collision
    }
    
    const sqrtDisc = Math.sqrt(discriminant);
    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);
    
    // Return earliest non-negative time
    if (t1 >= -EPS) {
        return Math.max(0, t1);
    }
    if (t2 >= -EPS) {
        return Math.max(0, t2);
    }
    
    return null;
}

/**
 * Calculate collision time between two circles.
 * Returns 0 if already penetrating (immediate collision), or the time until collision.
 */
export function getBallCollisionTime(
    ballA: CircleObject,
    ballB: CircleObject,
): number | null {
    scratchRelativeStart.copy(ballB.center).sub(ballA.center);
    scratchRelativeVelocity.copy(ballB.velocity).sub(ballA.velocity);
    const combinedRadius = ballA.radius + ballB.radius;
    
    // Check if circles are already penetrating
    const currentDistSq = scratchRelativeStart.lenSq();
    const combinedRadiusSq = combinedRadius * combinedRadius;
    if (currentDistSq < combinedRadiusSq - EPS) {
        // Already overlapping - return immediate collision
        return 0;
    }

    const a = scratchRelativeVelocity.lenSq();
    
    // If not moving relative to each other, no future collision
    if (a < EPS) {
        return null;
    }
    
    const b = 2 * scratchRelativeStart.dot(scratchRelativeVelocity);
    const c = currentDistSq - combinedRadiusSq;

    const numRoots = solveQuadratic(a, b, c, QUAD_BUFFER);
    if (numRoots > 0) {
        const t = QUAD_BUFFER[0]!;

        // Allow slightly negative t for numerical precision, clamp to 0
        if (t >= -EPS) {
            return Math.max(0, t);
        }
    }

    return null;
}

/**
 * Resolve elastic collision between two circles.
 * Includes positional correction to push overlapping circles apart.
 */
export function resolveBallCollision(
    ballA: CircleObject,
    ballB: CircleObject,
): void {
    scratchNormal.copy(ballB.center).sub(ballA.center);
    const dist = scratchNormal.len();
    
    // Avoid division by zero
    if (dist < EPS) {
        // Circles exactly overlapping - pick arbitrary separation direction
        scratchNormal.set(1, 0);
    } else {
        scratchNormal.div(dist);
    }
    
    scratchRelativeVelocity.copy(ballB.velocity).sub(ballA.velocity);
    const velocityAlongNormal = scratchRelativeVelocity.dot(scratchNormal);

    // Positional correction: push circles apart if overlapping
    const combinedRadius = ballA.radius + ballB.radius;
    const overlap = combinedRadius - dist;
    if (overlap > 0) {
        const inverseMassSum = ballA.inverseMass + ballB.inverseMass;
        if (inverseMassSum > 0) {
            // Distribute correction based on inverse mass
            const correctionA = overlap * (ballA.inverseMass / inverseMassSum);
            const correctionB = overlap * (ballB.inverseMass / inverseMassSum);
            ballA.center.addScaled(scratchNormal, -correctionA);
            ballB.center.addScaled(scratchNormal, correctionB);
        }
    }

    // If moving apart, don't apply impulse
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
    // 1. Calculate Vector form A to B (Wall Segment)
    scratchAB.copy(wall.pointB).sub(wall.pointA);

    // 2. Calculate Vector from A to Ball Center
    scratchAP.copy(ball.center).sub(wall.pointA);

    // 3. Project AP onto AB to find position 't' on the segment
    const lenSq = scratchAB.lenSq();
    const dot = scratchAP.dot(scratchAB);

    // Clamp t to the segment (0 to 1)
    // If lenSq is 0 (zero length wall), default to 0
    const t = lenSq > EPS ? Math.max(0, Math.min(1, dot / lenSq)) : 0;

    // 4. Find the closest point on the line segment
    scratchClosestPoint.copy(wall.pointA).addScaled(scratchAB, t);

    // 5. Calculate the TRUE Normal (From Wall -> Ball)
    scratchNormal.copy(ball.center).sub(scratchClosestPoint);

    const distSq = scratchNormal.lenSq();
    const dist = Math.sqrt(distSq);

    // If dist is 0 (ball center exactly on line), pick arbitrary normal
    if (dist < EPS) {
        scratchNormal.copy(scratchAB).perp().normalize();
    } else {
        // Normalize the existing distance vector
        scratchNormal.div(dist);
    }

    // --- BUG FIX 1: GEOMETRIC NORMAL ---
    // We now have a normal that explicitly points OUT of the wall.
    // We do NOT flip it based on velocity.

    // 6. Check if separating (Ball is already moving away?)
    scratchRelativeVelocity.copy(ball.velocity).sub(wall.velocity);
    const velocityAlongNormal = scratchRelativeVelocity.dot(scratchNormal);

    // If moving away, do not resolve velocity
    if (velocityAlongNormal > 0) {
        // ... But DO resolve position if we are deep inside (optional, but prevents leaking)
        return;
    }

    // --- BUG FIX 2: POSITIONAL CORRECTION (Anti-Leak) ---
    // If the ball has sunk into the wall, push it out immediately.
    const overlap = ball.radius - dist;
    if (overlap > 0) {
        // Push ball out by overlap amount
        ball.center.addScaled(scratchNormal, overlap);
    }

    // 7. Apply Impulse (Bounce)
    const restitution = Math.min(ball.restitution, wall.restitution);
    const inverseMassSum = ball.inverseMass + wall.inverseMass;

    if (inverseMassSum === 0) return;

    const j = -(1 + restitution) * velocityAlongNormal / inverseMassSum;

    ball.velocity.addScaled(scratchNormal, j * ball.inverseMass);
    wall.velocity.addScaled(scratchNormal, -j * wall.inverseMass);
}
