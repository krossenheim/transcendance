// Shared collision detection - used by both frontend and backend
import { Vec2, solveQuadratic, EPS } from "./math.js";

// Maximum ball speed to prevent tunneling at extreme velocities
export const MAX_BALL_SPEED = 800;

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
 * Calculate collision time between a circle and a point.
 * Used for detecting collisions with wall endpoints/corners.
 */
function getCirclePointCollisionTime(
    ball: ICircle,
    point: Vec2,
    pointVelocity: Vec2,
): number | null {
    // Relative position and velocity
    const relPos = ball.center.sub(point);
    const relVel = ball.velocity.sub(pointVelocity);
    
    // Check if already penetrating
    const distSq = relPos.lenSq();
    const radiusSq = ball.radius * ball.radius;
    if (distSq < radiusSq - EPS) {
        return 0; // Already penetrating
    }
    
    // Solve quadratic: |relPos + t*relVel|^2 = radius^2
    const a = relVel.lenSq();
    if (a < EPS) {
        return null; // Not moving relative to point
    }
    
    const b = 2 * relPos.dot(relVel);
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
 * Calculate collision time between a circle and a line segment.
 * Returns 0 if already penetrating (immediate collision), or the time until collision.
 * Also checks collision with segment endpoints to prevent corner tunneling.
 */
export function getWallCollisionTime(
    ball: ICircle,
    wall: ILine,
): number | null {
    const pointRelativeVelocity = ball.velocity.sub(wall.velocity);
    const pointRelativeStart = ball.center.sub(wall.pointA);

    const wallVec = wall.pointB.sub(wall.pointA);
    const wallLenSq = wallVec.dot(wallVec);
    
    // Avoid zero-length walls
    if (wallLenSq < EPS) {
        return null;
    }
    
    const wallLen = Math.sqrt(wallLenSq);
    
    // Check if ball is already penetrating the wall segment
    const projT = pointRelativeStart.dot(wallVec) / wallLenSq;
    const clampedT = Math.max(0, Math.min(1, projT));
    const closestPoint = wallVec.mul(clampedT);
    const toBall = pointRelativeStart.sub(closestPoint);
    const distToSegment = toBall.len();
    
    // If ball is already penetrating the segment, return immediate collision (t=0)
    if (distToSegment < ball.radius - EPS) {
        return 0; // Immediate collision - ball is inside
    }
    
    let wallNormal = wallVec.perp().normalize();

    // Choose the normal that faces the ball's approach direction
    if (pointRelativeVelocity.dot(wallNormal) >= -EPS)
        wallNormal = wallNormal.mul(-1);
    
    const vecAlongNormal = pointRelativeVelocity.dot(wallNormal);
    const distanceToLine = pointRelativeStart.dot(wallNormal);
    
    let tHitSegment: number | null = null;
    
    // Check collision with the infinite line (if not moving parallel)
    if (Math.abs(vecAlongNormal) >= EPS) {
        const tHit = (ball.radius - distanceToLine) / vecAlongNormal;
        
        if (tHit >= -EPS) {
            const clampedTHit = Math.max(0, tHit);
            
            // Check if hit point is within segment bounds
            const ballPosAtHit = pointRelativeStart.add(pointRelativeVelocity.mul(clampedTHit));
            const shadowLength = ballPosAtHit.dot(wallVec) / wallLen;
            
            // Allow small margin for numerical precision
            if (shadowLength >= -ball.radius && shadowLength <= wallLen + ball.radius) {
                tHitSegment = clampedTHit;
            }
        }
    }
    
    // Also check collision with segment endpoints (prevents corner tunneling at steep angles)
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
 * Calculate collision time between two circles.
 * Returns 0 if already penetrating (immediate collision), or the time until collision.
 */
export function getBallCollisionTime(
    ballA: ICircle,
    ballB: ICircle,
): number | null {
    const pointRelativeStart = ballB.center.sub(ballA.center);
    const pointRelativeVelocity = ballB.velocity.sub(ballA.velocity);
    const combinedRadius = ballA.radius + ballB.radius;
    
    // Check if circles are already penetrating
    const currentDistSq = pointRelativeStart.lenSq();
    const combinedRadiusSq = combinedRadius * combinedRadius;
    if (currentDistSq < combinedRadiusSq - EPS) {
        // Already overlapping - return immediate collision
        return 0;
    }

    const a = pointRelativeVelocity.lenSq();
    
    // If not moving relative to each other, no future collision
    if (a < EPS) {
        return null;
    }
    
    const b = 2 * pointRelativeStart.dot(pointRelativeVelocity);
    const c = currentDistSq - combinedRadiusSq;

    const roots = solveQuadratic(a, b, c);
    if (roots.length > 0) {
        const t = roots[0]!;

        // Allow slightly negative t for numerical precision, clamp to 0
        if (t >= -EPS) {
            return Math.max(0, t);
        }
    }

    return null;
}

/**
 * Resolve elastic collision between two circles
 * Modifies velocity of both balls in place
 * Also enforces max speed and includes positional correction to prevent tunneling
 */
export function resolveBallCollision(
    ballA: ICircle,
    ballB: ICircle,
): void {
    const normal = ballB.center.sub(ballA.center);
    const dist = normal.len();
    
    // Avoid division by zero
    if (dist < EPS) {
        return;
    }
    
    const normalizedNormal = normal.div(dist);
    const relativeVelocity = ballB.velocity.sub(ballA.velocity);
    const velocityAlongNormal = relativeVelocity.dot(normalizedNormal);

    if (velocityAlongNormal > 0) {
        return;
    }

    // Positional correction: push balls apart if overlapping
    const combinedRadius = ballA.radius + ballB.radius;
    const overlap = combinedRadius - dist;
    if (overlap > 0) {
        // Distribute correction based on inverse mass
        const totalInverseMass = ballA.inverseMass + ballB.inverseMass;
        if (totalInverseMass > 0) {
            const correctionA = overlap * (ballA.inverseMass / totalInverseMass);
            const correctionB = overlap * (ballB.inverseMass / totalInverseMass);
            ballA.center = ballA.center.sub(normalizedNormal.mul(correctionA));
            ballB.center = ballB.center.add(normalizedNormal.mul(correctionB));
        }
    }

    const j = -(1 + Math.min(ballA.restitution, ballB.restitution)) * velocityAlongNormal / (ballA.inverseMass + ballB.inverseMass);

    const impulse = normalizedNormal.mul(j);
    ballA.velocity = ballA.velocity.sub(impulse.mul(ballA.inverseMass));
    ballB.velocity = ballB.velocity.add(impulse.mul(ballB.inverseMass));

    // Enforce max speed on both balls
    const speedA = ballA.velocity.len();
    if (speedA > MAX_BALL_SPEED) {
        ballA.velocity = ballA.velocity.mul(MAX_BALL_SPEED / speedA);
    }
    const speedB = ballB.velocity.len();
    if (speedB > MAX_BALL_SPEED) {
        ballB.velocity = ballB.velocity.mul(MAX_BALL_SPEED / speedB);
    }
}

/**
 * Resolve collision between a circle and a line (bounce off wall)
 * Modifies velocity of ball (and wall if it has mass) in place
 * Also enforces max speed and includes positional correction to prevent tunneling
 */
export function resolveCircleLineCollision(
    ball: ICircle,
    wall: ILine,
): void {
    // 1. Calculate Vector from A to B (Wall Segment)
    const wallVec = wall.pointB.sub(wall.pointA);

    // 2. Calculate Vector from A to Ball Center
    const ap = ball.center.sub(wall.pointA);

    // 3. Project AP onto AB to find position 't' on the segment
    const lenSq = wallVec.lenSq();
    const dot = ap.dot(wallVec);

    // Clamp t to the segment (0 to 1)
    const t = lenSq > EPS ? Math.max(0, Math.min(1, dot / lenSq)) : 0;

    // 4. Find the closest point on the line segment
    const closestPoint = wall.pointA.add(wallVec.mul(t));

    // 5. Calculate the TRUE Normal (From Wall -> Ball)
    let wallNormal = ball.center.sub(closestPoint);
    const dist = wallNormal.len();

    // If dist is 0 (ball center exactly on line), pick arbitrary normal
    if (dist < EPS) {
        wallNormal = wallVec.perp().normalize();
    } else {
        wallNormal = wallNormal.div(dist);
    }

    // 6. Check if separating (Ball is already moving away)
    const relativeVelocity = ball.velocity.sub(wall.velocity);
    const velocityAlongNormal = relativeVelocity.dot(wallNormal);
    
    // If moving away, don't resolve velocity (but still do positional correction)
    if (velocityAlongNormal > 0) {
        return;
    }

    // 7. Positional Correction (Anti-Leak): push ball out if penetrating
    const overlap = ball.radius - dist;
    if (overlap > 0) {
        ball.center = ball.center.add(wallNormal.mul(overlap));
    }

    // 8. Apply Impulse (Bounce)
    const j = -(1 + Math.min(ball.restitution, wall.restitution)) * velocityAlongNormal / (ball.inverseMass + wall.inverseMass);

    const impulse = wallNormal.mul(j);
    ball.velocity = ball.velocity.add(impulse.mul(ball.inverseMass));
    wall.velocity = wall.velocity.sub(impulse.mul(wall.inverseMass));

    // Enforce max speed to prevent tunneling at extreme velocities
    const speed = ball.velocity.len();
    if (speed > MAX_BALL_SPEED) {
        ball.velocity = ball.velocity.mul(MAX_BALL_SPEED / speed);
    }
}
