// Client-side Pong physics engine
// Mirrors the server-side physics for client-side prediction

export { Vec2, EPS, FAT_EPS, solveQuadratic, isNearly } from "./math";
export { 
    CollisionResponse,
    getWallCollisionTime,
    getBallCollisionTime,
    resolveBallCollision,
    resolveCircleLineCollision
} from "./collision";
export { ClientPongSimulation } from "./ClientPongSimulation";
export type { BallState, PaddleState, WallState, GameState } from "./ClientPongSimulation";
