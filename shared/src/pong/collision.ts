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
 * Calculate collision time between a circle and a line segment.
 * Returns 0 if already penetrating (immediate collision), or the time until collision.
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
    
    let wallNormal = wallVec.perp().normalize();

    // Choose the normal that faces the ball's approach direction
    if (pointRelativeVelocity.dot(wallNormal) >= -EPS)
        wallNormal = wallNormal.mul(-1);
    
    const vecAlongNormal = pointRelativeVelocity.dot(wallNormal);
    const distanceToLine = pointRelativeStart.dot(wallNormal);
    
    // Check if ball is already penetrating the wall segment
    // First, find the closest point on the segment to the ball
    const projT = pointRelativeStart.dot(wallVec) / wallLenSq;
    const clampedT = Math.max(0, Math.min(1, projT));
    const closestPoint = wallVec.mul(clampedT);
    const toBall = pointRelativeStart.sub(closestPoint);
    const distToSegment = toBall.len();
    
    // If ball is already penetrating the segment, return immediate collision (t=0)
    if (distToSegment < ball.radius - EPS) {
        // Verify ball is moving towards or along the wall (not escaping)
        // Check if the ball center is within the segment bounds (with some margin)
        if (clampedT > -0.1 && clampedT < 1.1) {
            return 0; // Immediate collision - ball is inside
        }
    }
    
    // If moving parallel to wall (or away), no collision via this method
    if (Math.abs(vecAlongNormal) < EPS) {
        return null;
    }

    const tHit = (ball.radius - distanceToLine) / vecAlongNormal;

    if (tHit < -EPS) {
        return null;
    }
    
    // Clamp small negative values to 0 (numerical precision)
    const clampedTHit = Math.max(0, tHit);

    const ballPosAtHit = pointRelativeStart.add(pointRelativeVelocity.mul(clampedTHit));
    const shadowLengthSq = ballPosAtHit.dot(wallVec);
    const segmentT = shadowLengthSq / wallLenSq;

    if (segmentT < 0 || segmentT > 1) {
        return null;
    }

    return clampedTHit;
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
