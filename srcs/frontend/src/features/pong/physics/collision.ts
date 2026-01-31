// Re-export from shared physics module
export { 
    CollisionResponse,
    getWallCollisionTime as getWallCollisionTimeInterface,
    getBallCollisionTime as getBallCollisionTimeInterface,
    resolveBallCollision,
    resolveCircleLineCollision,
} from "@app/shared/pong/collision";

export type { ICircle, ILine } from "@app/shared/pong/collision";

// Re-export Vec2 for convenience (used by collision functions)
export { Vec2 } from "@app/shared/pong/math";

import { Vec2 } from "@app/shared/pong/math";
import { 
    getWallCollisionTime as sharedGetWallCollisionTime,
    getBallCollisionTime as sharedGetBallCollisionTime,
    ICircle,
    ILine,
} from "@app/shared/pong/collision";

// Convenience wrapper functions that accept primitives
// These match the original client API for easier usage in ClientPongSimulation

export function getWallCollisionTime(
    ballCenter: Vec2,
    ballRadius: number,
    ballVelocity: Vec2,
    wallPointA: Vec2,
    wallPointB: Vec2,
    wallVelocity: Vec2 = new Vec2(0, 0)
): number | null {
    const ball: ICircle = {
        center: ballCenter,
        radius: ballRadius,
        velocity: ballVelocity,
        inverseMass: 1,
        restitution: 1,
    };
    const wall: ILine = {
        pointA: wallPointA,
        pointB: wallPointB,
        velocity: wallVelocity,
        inverseMass: 0,
        restitution: 1,
    };
    return sharedGetWallCollisionTime(ball, wall);
}

export function getBallCollisionTime(
    ballACenter: Vec2,
    ballARadius: number,
    ballAVelocity: Vec2,
    ballBCenter: Vec2,
    ballBRadius: number,
    ballBVelocity: Vec2
): number | null {
    const ballA: ICircle = {
        center: ballACenter,
        radius: ballARadius,
        velocity: ballAVelocity,
        inverseMass: 1,
        restitution: 1,
    };
    const ballB: ICircle = {
        center: ballBCenter,
        radius: ballBRadius,
        velocity: ballBVelocity,
        inverseMass: 1,
        restitution: 1,
    };
    return sharedGetBallCollisionTime(ballA, ballB);
}

