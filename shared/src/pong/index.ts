// Shared Pong physics - single source of truth for frontend and backend
export { Vec2, EPS, FAT_EPS, isNearly, solveQuadratic } from "./math.js";
export { 
    CollisionResponse,
    getWallCollisionTime,
    getBallCollisionTime,
    resolveBallCollision,
    resolveCircleLineCollision,
} from "./collision.js";
export type { ICircle, ILine } from "./collision.js";
