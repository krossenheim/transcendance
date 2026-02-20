// Client-side Pong simulation that mirrors the server physics
// This runs locally for smooth visuals while the server remains authoritative

import { Vec2, EPS, FAT_EPS } from "./math";
import {
    getWallCollisionTime,
    getBallCollisionTime,
    resolveBallCollision,
    resolveCircleLineCollision,
} from "./collision";

// ====================
// Data types (matching server JSON format)
// ====================

export interface BallState {
    id: number;
    x: number;
    y: number;
    dx: number;
    dy: number;
    radius: number;
    inverseMass: number;
}

export interface PaddleState {
    paddle_id: number;
    owner_id: number;
    x: number;
    y: number;
    r: number;  // rotation angle
    w: number;  // width
    l: number;  // length (height)
    vx: number;
    vy: number;
    speed: number;
}

export interface WallState {
    ax: number;
    ay: number;
    bx: number;
    by: number;
    playerId: number | null;  // null for neutral walls
}

export interface GameState {
    board_id: number | null;
    elapsedTime: number;
    balls: BallState[];
    paddles: PaddleState[];
    walls: WallState[];
    metadata?: {
        gameOptions?: {
            canvasWidth: number;
            canvasHeight: number;
            ballSpeed: number;
            paddleSpeedFactor: number;
            gameDuration: number;
        };
    };
}

// ====================
// Client Simulation
// ====================

// Pre-allocated scratch vectors to avoid GC pressure in hot loops
// These are reused across frames instead of creating new Vec2 objects
const _scratchBallCenter = new Vec2(0, 0);
const _scratchBallVelocity = new Vec2(0, 0);
const _scratchWallA = new Vec2(0, 0);
const _scratchWallB = new Vec2(0, 0);
const _scratchPaddleVelocity = new Vec2(0, 0);
const _scratchOtherCenter = new Vec2(0, 0);
const _scratchOtherVelocity = new Vec2(0, 0);
// Paddle line scratch vectors (4 lines = 8 points)
const _scratchLineA = [new Vec2(0, 0), new Vec2(0, 0), new Vec2(0, 0), new Vec2(0, 0)];
const _scratchLineB = [new Vec2(0, 0), new Vec2(0, 0), new Vec2(0, 0), new Vec2(0, 0)];
// Paddle corner scratch vectors (4 corners)
const _scratchCorner = [new Vec2(0, 0), new Vec2(0, 0), new Vec2(0, 0), new Vec2(0, 0)];
// Collision resolution scratch vectors
const _scratchResolveFaceA = new Vec2(0, 0);
const _scratchResolveFaceB = new Vec2(0, 0);

// Reusable collision objects to avoid allocation in resolveCollision
const _reusableBallObj = {
    center: new Vec2(0, 0),
    velocity: new Vec2(0, 0),
    inverseMass: 1,
    restitution: 1.0,
    radius: 10,
};
const _reusableWallObj = {
    pointA: new Vec2(0, 0),
    pointB: new Vec2(0, 0),
    velocity: new Vec2(0, 0),
    inverseMass: 0,
    restitution: 1.0,
};
const _reusableOtherBallObj = {
    center: new Vec2(0, 0),
    velocity: new Vec2(0, 0),
    inverseMass: 1,
    restitution: 1.0,
    radius: 10,
};

export class ClientPongSimulation {
    private balls: BallState[] = [];
    private paddles: PaddleState[] = [];
    private walls: WallState[] = [];
    private elapsedTime: number = 0;
    private timeScale: number = 1.0;
    private boardId: number | null = null;
    
    private gameOptions = {
        canvasWidth: 1000,
        canvasHeight: 1000,
        ballSpeed: 450,
        gameDuration: 180,
    };
    
    // Track pressed keys for local paddle control
    private pressedKeys: Set<string> = new Set();
    private myUserId: number = -1;
    
    // Track distance traveled since last sync
    private distanceSinceLastSync: Map<number, number> = new Map();
    
    // Debug frame counter
    private static debugFrameCount: number = 0;
    
    // Smooth interpolation targets (server state we're blending toward)
    private serverBallTargets: Map<number, { x: number; y: number; dx: number; dy: number }> = new Map();

    constructor() {}

    /**
     * Initialize simulation from server state
     */
    public initFromServerState(serverState: any, myUserId: number): void {
        this.myUserId = myUserId;
        this.boardId = serverState.board_id ?? serverState.boardId ?? null;
        
        // Parse metadata
        if (serverState.metadata?.gameOptions) {
            this.gameOptions = { ...this.gameOptions, ...serverState.metadata.gameOptions };
        }
        if (serverState.metadata?.elapsedTime !== undefined) {
            this.elapsedTime = serverState.metadata.elapsedTime;
        }
        
        // Parse balls from server format: [x, y, dx, dy, radius, inverseMass]
        this.balls = (serverState.balls || []).map((b: any, idx: number) => {
            if (Array.isArray(b)) {
                return {
                    id: idx,
                    x: b[0] ?? 0,
                    y: b[1] ?? 0,
                    dx: b[2] ?? 0,
                    dy: b[3] ?? 0,
                    radius: b[4] ?? 10,
                    inverseMass: b[5] ?? 1.0,
                };
            }
            return {
                id: b.id ?? idx,
                x: b.x ?? 0,
                y: b.y ?? 0,
                dx: b.dx ?? 0,
                dy: b.dy ?? 0,
                radius: b.radius ?? 10,
                inverseMass: b.inverseMass ?? 1.0,
            };
        });
        
        // Parse paddles from server format: [x, y, angle, width, height, vx, vy, playerId, speed]
        this.paddles = (serverState.paddles || []).map((p: any, idx: number) => {
            if (Array.isArray(p)) {
                const parsedSpeed = p[8] ?? 150;
                // Debug logging disabled for performance
                // console.log(`[ClientSim] Paddle ${idx} speed from server: ${parsedSpeed} (raw p[8]: ${p[8]})`);
                return {
                    paddle_id: p[7] ?? idx,
                    owner_id: p[7] ?? idx,
                    x: p[0] ?? 0,
                    y: p[1] ?? 0,
                    r: p[2] ?? 0,
                    w: p[3] ?? 10,
                    l: p[4] ?? 50,
                    vx: p[5] ?? 0,
                    vy: p[6] ?? 0,
                    speed: parsedSpeed,
                };
            }
            return {
                paddle_id: p.paddle_id ?? p.owner_id ?? idx,
                owner_id: p.owner_id ?? p.paddle_id ?? idx,
                x: p.x ?? 0,
                y: p.y ?? 0,
                r: p.r ?? 0,
                w: p.w ?? 10,
                l: p.l ?? 50,
                vx: p.vx ?? 0,
                vy: p.vy ?? 0,
                speed: p.speed ?? 150,
            };
        });
        
        // Parse walls from server format: [ax, ay, bx, by, vx, vy, playerId]
        this.walls = (serverState.walls || []).map((w: any) => {
            if (Array.isArray(w)) {
                return {
                    ax: w[0] ?? 0,
                    ay: w[1] ?? 0,
                    bx: w[2] ?? 0,
                    by: w[3] ?? 0,
                    playerId: w[6] ?? null,
                };
            }
            return {
                ax: w.ax ?? w.x ?? 0,
                ay: w.ay ?? w.y ?? 0,
                bx: w.bx ?? 0,
                by: w.by ?? 0,
                playerId: w.playerId ?? null,
            };
        });
    }

    /**
     * Set pressed keys for local paddle control
     */
    public setPressedKeys(keys: string[]): void {
        this.pressedKeys = new Set(keys.map(k => k.toLowerCase()));
        this.updatePaddleVelocities();
    }

    /**
     * Update paddle velocities based on current pressed keys
     * Avoids creating Vec2 objects to reduce GC pressure
     */
    private updatePaddleVelocities(): void {
        for (const paddle of this.paddles) {
            if (paddle.owner_id !== this.myUserId) continue;
            
            // Determine movement direction based on keys
            // The server uses isTopHalf to determine which direction each key moves the paddle
            // isTopHalf = (Vec2(0, -1).dot(paddleDirection) > 0)
            // paddleDirection is derived from paddle.r (the angle)
            const cosR = Math.cos(paddle.r);
            const sinR = Math.sin(paddle.r);
            // paddleDir = (cosR, sinR), Vec2(0, -1).dot(paddleDir) = -sinR
            const isTopHalf = (-sinR > 0);
            
            // Server logic: arrowleft.isClockwise = !isTopHalf, arrowright.isClockwise = isTopHalf
            // moveDirection += isClockwise ? 1 : -1
            const leftPressed = this.pressedKeys.has('arrowleft') || this.pressedKeys.has('a');
            const rightPressed = this.pressedKeys.has('arrowright') || this.pressedKeys.has('d');
            
            let moveDirection = 0;
            if (leftPressed) {
                // arrowleft.isClockwise = !isTopHalf
                moveDirection += (!isTopHalf) ? 1 : -1;
            }
            if (rightPressed) {
                // arrowright.isClockwise = isTopHalf
                moveDirection += (isTopHalf) ? 1 : -1;
            }
            
            if (moveDirection === 0) {
                paddle.vx = 0;
                paddle.vy = 0;
            } else {
                // clockwiseBaseVelocity = paddleDirection.perp().normalize()
                // perp of (cosR, sinR) is (-sinR, cosR), already normalized
                const perpX = -sinR;
                const perpY = cosR;
                paddle.vx = perpX * moveDirection * paddle.speed;
                paddle.vy = perpY * moveDirection * paddle.speed;
            }
        }
    }

    /**
     * Run the physics simulation for deltaTime seconds
     * Matches server's playSimulation() logic exactly
     */
    public simulate(deltaTime: number): void {
        // Match server exactly: timeRemaining = deltaTime * timeScale
        let timeRemaining = deltaTime * this.timeScale;
        if (timeRemaining <= 0) return;
        
        // Frame counter for debugging (no object allocation)
        ClientPongSimulation.debugFrameCount++;
        
        // Match server's max iterations (1000)
        const maxIterations = 1000;
        let iterations = 0;
        
        // Maximum distance for post-collision nudge (prevents high-speed tunneling)
        const MAX_NUDGE_DISTANCE = 0.5;
        
        while (timeRemaining > EPS && iterations < maxIterations) {
            iterations++;
            
            // Find the next collision
            const collision = this.findNextCollision(timeRemaining);
            
            // Match server: collision.time - EPS > timeRemaining
            if (collision === null || collision.time - EPS > timeRemaining) {
                // No collision in remaining time, just move everything
                this.moveObjects(timeRemaining);
                this.elapsedTime += timeRemaining / this.timeScale;
                break;
            }
            
            // Move to collision point
            this.moveObjects(collision.time);
            this.elapsedTime += collision.time / this.timeScale;
            timeRemaining -= collision.time;
            
            // Velocity-aware nudge: limit distance to prevent high-speed tunneling
            const ball = this.balls[collision.ballIdx]!;
            const ballSpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
            if (ballSpeed > EPS) {
                const nudgeDistance = ballSpeed * FAT_EPS;
                const safeDeltaTime = nudgeDistance > MAX_NUDGE_DISTANCE 
                    ? MAX_NUDGE_DISTANCE / ballSpeed 
                    : FAT_EPS;
                this.moveObjects(safeDeltaTime);
            }
            
            // Resolve collision
            this.resolveCollision(collision);
        }

        // BULLETPROOF: Check for balls that escaped bounds and reset them
        this.checkBallBounds();
    }
    
    /**
     * Find the next collision in the simulation
     * Uses pre-allocated scratch vectors to avoid GC pressure
     */
    private findNextCollision(maxTime: number): { time: number; type: string; ballIdx: number; targetIdx?: number } | null {
        let earliest: { time: number; type: string; ballIdx: number; targetIdx?: number } | null = null;
        
        for (let i = 0; i < this.balls.length; i++) {
            const ball = this.balls[i]!;
            // Reuse scratch vectors instead of creating new ones
            _scratchBallCenter.x = ball.x;
            _scratchBallCenter.y = ball.y;
            _scratchBallVelocity.x = ball.dx;
            _scratchBallVelocity.y = ball.dy;
            
            // Check ball-wall collisions
            for (let j = 0; j < this.walls.length; j++) {
                const wall = this.walls[j]!;
                _scratchWallA.x = wall.ax;
                _scratchWallA.y = wall.ay;
                _scratchWallB.x = wall.bx;
                _scratchWallB.y = wall.by;
                
                const tHit = getWallCollisionTime(_scratchBallCenter, ball.radius, _scratchBallVelocity, _scratchWallA, _scratchWallB);
                
                // Match server: only check if tHit is not null/NaN, and if it's earliest
                if (tHit !== null && !isNaN(tHit) && tHit <= maxTime) {
                    if (earliest === null || tHit < earliest.time) {
                        earliest = { time: tHit, type: 'wall', ballIdx: i, targetIdx: j };
                    }
                }
            }
            
            // Check ball-paddle collisions (paddles are rectangles with rounded corners)
            for (let j = 0; j < this.paddles.length; j++) {
                const paddle = this.paddles[j]!;
                _scratchPaddleVelocity.x = paddle.vx;
                _scratchPaddleVelocity.y = paddle.vy;
                
                // Compute paddle geometry into scratch arrays
                this.computePaddleGeometry(paddle);
                
                // Check paddle edges (4 lines)
                for (let k = 0; k < 4; k++) {
                    const tHit = getWallCollisionTime(
                        _scratchBallCenter, ball.radius, _scratchBallVelocity,
                        _scratchLineA[k]!, _scratchLineB[k]!, _scratchPaddleVelocity
                    );
                    
                    if (tHit !== null && !isNaN(tHit) && tHit <= maxTime) {
                        if (earliest === null || tHit < earliest.time) {
                            earliest = { time: tHit, type: 'paddle', ballIdx: i, targetIdx: j };
                        }
                    }
                }
                
                // Check paddle corners (4 corners) - radius = halfHeight to match server
                const cornerRadius = (paddle.l / 2);
                for (let k = 0; k < 4; k++) {
                    const tHit = getBallCollisionTime(
                        _scratchBallCenter, ball.radius, _scratchBallVelocity,
                        _scratchCorner[k]!, cornerRadius, _scratchPaddleVelocity
                    );
                    
                    if (tHit !== null && !isNaN(tHit) && tHit <= maxTime) {
                        if (earliest === null || tHit < earliest.time) {
                            earliest = { time: tHit, type: 'paddle', ballIdx: i, targetIdx: j };
                        }
                    }
                }
            }
            
            // Check ball-ball collisions
            for (let j = i + 1; j < this.balls.length; j++) {
                const other = this.balls[j]!;
                _scratchOtherCenter.x = other.x;
                _scratchOtherCenter.y = other.y;
                _scratchOtherVelocity.x = other.dx;
                _scratchOtherVelocity.y = other.dy;
                
                const tHit = getBallCollisionTime(
                    _scratchBallCenter, ball.radius, _scratchBallVelocity,
                    _scratchOtherCenter, other.radius, _scratchOtherVelocity
                );
                
                if (tHit !== null && !isNaN(tHit) && tHit <= maxTime) {
                    if (earliest === null || tHit < earliest.time) {
                        earliest = { time: tHit, type: 'ball', ballIdx: i, targetIdx: j };
                    }
                }
            }
        }
        
        return earliest;
    }

    /**
     * Compute paddle geometry into scratch arrays (lines and corners)
     * This avoids creating new Vec2 objects every frame
     */
    private computePaddleGeometry(paddle: PaddleState): void {
        const cosR = Math.cos(paddle.r);
        const sinR = Math.sin(paddle.r);
        const halfWidth = paddle.w / 2;
        const halfHeight = paddle.l / 2;
        
        // dir = (cos, sin), perp = (-sin, cos)
        const dirX = cosR;
        const dirY = sinR;
        const perpX = -sinR;
        const perpY = cosR;
        
        // Compute four corners
        // topLeft = center + perp * (-halfWidth) + dir * (-halfHeight)
        const tlX = paddle.x + perpX * (-halfWidth) + dirX * (-halfHeight);
        const tlY = paddle.y + perpY * (-halfWidth) + dirY * (-halfHeight);
        // topRight = center + perp * (-halfWidth) + dir * (halfHeight)
        const trX = paddle.x + perpX * (-halfWidth) + dirX * halfHeight;
        const trY = paddle.y + perpY * (-halfWidth) + dirY * halfHeight;
        // bottomLeft = center + perp * (halfWidth) + dir * (-halfHeight)
        const blX = paddle.x + perpX * halfWidth + dirX * (-halfHeight);
        const blY = paddle.y + perpY * halfWidth + dirY * (-halfHeight);
        // bottomRight = center + perp * (halfWidth) + dir * (halfHeight)
        const brX = paddle.x + perpX * halfWidth + dirX * halfHeight;
        const brY = paddle.y + perpY * halfWidth + dirY * halfHeight;
        
        // Store corners
        _scratchCorner[0]!.x = tlX; _scratchCorner[0]!.y = tlY;
        _scratchCorner[1]!.x = trX; _scratchCorner[1]!.y = trY;
        _scratchCorner[2]!.x = blX; _scratchCorner[2]!.y = blY;
        _scratchCorner[3]!.x = brX; _scratchCorner[3]!.y = brY;
        
        // Store lines: [topLeft-topRight, bottomLeft-bottomRight, topLeft-bottomLeft, topRight-bottomRight]
        _scratchLineA[0]!.x = tlX; _scratchLineA[0]!.y = tlY;
        _scratchLineB[0]!.x = trX; _scratchLineB[0]!.y = trY;
        _scratchLineA[1]!.x = blX; _scratchLineA[1]!.y = blY;
        _scratchLineB[1]!.x = brX; _scratchLineB[1]!.y = brY;
        _scratchLineA[2]!.x = tlX; _scratchLineA[2]!.y = tlY;
        _scratchLineB[2]!.x = blX; _scratchLineB[2]!.y = blY;
        _scratchLineA[3]!.x = trX; _scratchLineA[3]!.y = trY;
        _scratchLineB[3]!.x = brX; _scratchLineB[3]!.y = brY;
    }

    /**
     * Get the lines that make up a paddle for collision detection
     * @deprecated Use computePaddleGeometry() with scratch arrays instead
     */
    private getPaddleLines(paddle: PaddleState): { a: Vec2; b: Vec2 }[] {
        const center = new Vec2(paddle.x, paddle.y);
        const dir = new Vec2(Math.cos(paddle.r), Math.sin(paddle.r));
        const perp = dir.perp();
        
        const halfWidth = paddle.w / 2;
        const halfHeight = paddle.l / 2;
        
        // Four corners
        const topLeft = center.add(perp.mul(-halfWidth)).add(dir.mul(-halfHeight));
        const topRight = center.add(perp.mul(-halfWidth)).add(dir.mul(halfHeight));
        const bottomLeft = center.add(perp.mul(halfWidth)).add(dir.mul(-halfHeight));
        const bottomRight = center.add(perp.mul(halfWidth)).add(dir.mul(halfHeight));
        
        return [
            { a: topLeft, b: topRight },      // top edge
            { a: bottomLeft, b: bottomRight }, // bottom edge
            { a: topLeft, b: bottomLeft },     // left edge
            { a: topRight, b: bottomRight },   // right edge
        ];
    }

    /**
     * Get the corner circles of a paddle for collision detection
     * Matches server-side paddle corner radius for consistent physics
     */
    private getPaddleCorners(paddle: PaddleState): { center: Vec2; radius: number }[] {
        const center = new Vec2(paddle.x, paddle.y);
        const dir = new Vec2(Math.cos(paddle.r), Math.sin(paddle.r));
        const perp = dir.perp();
        
        const halfWidth = paddle.w / 2;
        const halfHeight = paddle.l / 2;
        // Corner radius matches server: full halfHeight for no gaps
        const cornerRadius = halfHeight;
        
        // Four corner positions
        const topLeft = center.add(perp.mul(-halfWidth)).add(dir.mul(-halfHeight));
        const topRight = center.add(perp.mul(-halfWidth)).add(dir.mul(halfHeight));
        const bottomLeft = center.add(perp.mul(halfWidth)).add(dir.mul(-halfHeight));
        const bottomRight = center.add(perp.mul(halfWidth)).add(dir.mul(halfHeight));
        
        return [
            { center: topLeft, radius: cornerRadius },
            { center: topRight, radius: cornerRadius },
            { center: bottomLeft, radius: cornerRadius },
            { center: bottomRight, radius: cornerRadius },
        ];
    }

    /**
     * Move all objects by deltaTime
     */
    private moveObjects(deltaTime: number): void {
        // Move balls and track distance traveled
        for (const ball of this.balls) {
            const dx = ball.dx * deltaTime;
            const dy = ball.dy * deltaTime;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            ball.x += dx;
            ball.y += dy;
            
            // Track cumulative distance since last sync
            const prevDist = this.distanceSinceLastSync.get(ball.id) || 0;
            this.distanceSinceLastSync.set(ball.id, prevDist + distance);
        }
        
        // Move paddles
        for (const paddle of this.paddles) {
            paddle.x += paddle.vx * deltaTime;
            paddle.y += paddle.vy * deltaTime;
        }
    }

    /**
     * Resolve a collision
     * Uses pre-allocated objects to avoid GC pressure
     */
    private resolveCollision(collision: { time: number; type: string; ballIdx: number; targetIdx?: number }): void {
        const ball = this.balls[collision.ballIdx]!;
        
        switch (collision.type) {
            case 'wall': {
                const wall = this.walls[collision.targetIdx!]!;
                
                // Reuse pre-allocated objects
                _reusableBallObj.center.x = ball.x;
                _reusableBallObj.center.y = ball.y;
                _reusableBallObj.velocity.x = ball.dx;
                _reusableBallObj.velocity.y = ball.dy;
                _reusableBallObj.inverseMass = ball.inverseMass;
                _reusableBallObj.radius = ball.radius;
                
                _reusableWallObj.pointA.x = wall.ax;
                _reusableWallObj.pointA.y = wall.ay;
                _reusableWallObj.pointB.x = wall.bx;
                _reusableWallObj.pointB.y = wall.by;
                _reusableWallObj.velocity.x = 0;
                _reusableWallObj.velocity.y = 0;
                
                resolveCircleLineCollision(_reusableBallObj, _reusableWallObj);
                
                ball.dx = _reusableBallObj.velocity.x;
                ball.dy = _reusableBallObj.velocity.y;
                
                // Normalize to constant ball speed (prevents speed changes from floating point drift)
                const wallBounceSpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
                if (wallBounceSpeed > 0.01) {
                    const targetSpeed = this.gameOptions.ballSpeed;
                    const scale = targetSpeed / wallBounceSpeed;
                    ball.dx *= scale;
                    ball.dy *= scale;
                }
                
                // If this is a player wall, reset ball to center (simplified - server handles scoring)
                if (wall.playerId !== null) {
                    ball.x = this.gameOptions.canvasWidth / 2;
                    ball.y = this.gameOptions.canvasHeight / 2;
                    const angle = Math.random() * 2 * Math.PI;
                    ball.dx = Math.cos(angle) * this.gameOptions.ballSpeed;
                    ball.dy = Math.sin(angle) * this.gameOptions.ballSpeed;
                }
                break;
            }
            
            case 'paddle': {
                const paddle = this.paddles[collision.targetIdx!]!;
                const cosR = Math.cos(paddle.r);
                const sinR = Math.sin(paddle.r);
                const halfWidth = paddle.w / 2;
                
                // perp = (-sin, cos)
                const perpX = -sinR;
                const perpY = cosR;
                
                // Front face of paddle (using scratch vectors)
                _scratchResolveFaceA.x = paddle.x + perpX * (-halfWidth);
                _scratchResolveFaceA.y = paddle.y + perpY * (-halfWidth);
                _scratchResolveFaceB.x = paddle.x + perpX * halfWidth;
                _scratchResolveFaceB.y = paddle.y + perpY * halfWidth;
                
                // Reuse pre-allocated objects
                _reusableBallObj.center.x = ball.x;
                _reusableBallObj.center.y = ball.y;
                _reusableBallObj.velocity.x = ball.dx;
                _reusableBallObj.velocity.y = ball.dy;
                _reusableBallObj.inverseMass = ball.inverseMass;
                _reusableBallObj.radius = ball.radius;
                
                _reusableWallObj.pointA.x = _scratchResolveFaceA.x;
                _reusableWallObj.pointA.y = _scratchResolveFaceA.y;
                _reusableWallObj.pointB.x = _scratchResolveFaceB.x;
                _reusableWallObj.pointB.y = _scratchResolveFaceB.y;
                _reusableWallObj.velocity.x = paddle.vx;
                _reusableWallObj.velocity.y = paddle.vy;
                
                resolveCircleLineCollision(_reusableBallObj, _reusableWallObj);
                
                ball.dx = _reusableBallObj.velocity.x;
                ball.dy = _reusableBallObj.velocity.y;
                
                // Normalize to constant ball speed (paddle movement shouldn't change ball speed)
                const paddleBounceSpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
                const targetSpeed = this.gameOptions.ballSpeed;
                if (paddleBounceSpeed > 0.01) {
                    const scale = targetSpeed / paddleBounceSpeed;
                    ball.dx *= scale;
                    ball.dy *= scale;
                }
                
                // Push ball out of paddle to prevent getting stuck
                const pushDist = ball.radius * 0.5;
                if (targetSpeed > 0) {
                    ball.x += (ball.dx / targetSpeed) * pushDist;
                    ball.y += (ball.dy / targetSpeed) * pushDist;
                }
                break;
            }
            
            case 'ball': {
                const other = this.balls[collision.targetIdx!]!;
                
                // Reuse pre-allocated objects
                _reusableBallObj.center.x = ball.x;
                _reusableBallObj.center.y = ball.y;
                _reusableBallObj.velocity.x = ball.dx;
                _reusableBallObj.velocity.y = ball.dy;
                _reusableBallObj.inverseMass = ball.inverseMass;
                _reusableBallObj.radius = ball.radius;
                
                _reusableOtherBallObj.center.x = other.x;
                _reusableOtherBallObj.center.y = other.y;
                _reusableOtherBallObj.velocity.x = other.dx;
                _reusableOtherBallObj.velocity.y = other.dy;
                _reusableOtherBallObj.inverseMass = other.inverseMass;
                _reusableOtherBallObj.radius = other.radius;
                
                resolveBallCollision(_reusableBallObj, _reusableOtherBallObj);
                
                ball.dx = _reusableBallObj.velocity.x;
                ball.dy = _reusableBallObj.velocity.y;
                other.dx = _reusableOtherBallObj.velocity.x;
                other.dy = _reusableOtherBallObj.velocity.y;
                
                // Normalize both balls to constant ball speed
                const targetSpeed = this.gameOptions.ballSpeed;
                const ballASpeed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
                if (ballASpeed > 0.01) {
                    const scaleA = targetSpeed / ballASpeed;
                    ball.dx *= scaleA;
                    ball.dy *= scaleA;
                }
                const ballBSpeed = Math.sqrt(other.dx * other.dx + other.dy * other.dy);
                if (ballBSpeed > 0.01) {
                    const scaleB = targetSpeed / ballBSpeed;
                    other.dx *= scaleB;
                    other.dy *= scaleB;
                }
                break;
            }
        }
    }

    /**
     * Check if a ball is near any wall (within threshold distance)
     * Used to detect when CLIENT ball is about to bounce
     */
    private isBallNearWall(ball: { x: number; y: number; radius: number }): boolean {
        const threshold = ball.radius * 3; // Within 3 radii of wall - sync before bounce
        
        for (const wall of this.walls) {
            // Skip player walls (goals)
            if (wall.playerId !== null) continue;
            
            // Calculate distance from ball center to wall line segment
            const wallVec = { x: wall.bx - wall.ax, y: wall.by - wall.ay };
            const wallLen = Math.sqrt(wallVec.x * wallVec.x + wallVec.y * wallVec.y);
            if (wallLen < 0.001) continue;
            
            // Normalized wall direction
            const wallDir = { x: wallVec.x / wallLen, y: wallVec.y / wallLen };
            
            // Vector from wall start to ball
            const toBall = { x: ball.x - wall.ax, y: ball.y - wall.ay };
            
            // Project ball onto wall line
            const projection = toBall.x * wallDir.x + toBall.y * wallDir.y;
            
            // Clamp to segment
            const t = Math.max(0, Math.min(wallLen, projection));
            
            // Closest point on wall
            const closest = { x: wall.ax + wallDir.x * t, y: wall.ay + wallDir.y * t };
            
            // Distance from ball to closest point
            const dist = Math.sqrt((ball.x - closest.x) ** 2 + (ball.y - closest.y) ** 2);
            
            if (dist <= ball.radius + threshold) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Get indices of balls that are near walls and should be synced
     */
    private getBallsNearWalls(): Set<number> {
        const nearWall = new Set<number>();
        for (let i = 0; i < this.balls.length; i++) {
            if (this.isBallNearWall(this.balls[i]!)) {
                nearWall.add(i);
            }
        }
        return nearWall;
    }
    
    /**
     * Reset sync tracking after a sync is performed
     */
    private resetSyncTracking(): void {
        this.distanceSinceLastSync.clear();
    }

    /**
     * Reconcile local state with server state
     * Strategy: SMOOTH INTERPOLATION - continuously blend toward server state
     * Never snap, always smooth. This prevents visible jumps.
     */
    public reconcileWithServer(serverState: any, interpolationFactor: number = 0.15): void {
        // Always sync timeScale from server (for SUPER_SPEED powerup)
        if (serverState.metadata?.timeScale !== undefined) {
            this.timeScale = serverState.metadata.timeScale;
        }
        
        // Parse server balls
        const serverBalls = (serverState.balls || []).map((b: any, idx: number) => {
            if (Array.isArray(b)) {
                return {
                    id: idx,
                    x: b[0] ?? 0,
                    y: b[1] ?? 0,
                    dx: b[2] ?? 0,
                    dy: b[3] ?? 0,
                    radius: b[4] ?? 10,
                    inverseMass: b[5] ?? 1.0,
                };
            }
            return {
                id: b.id ?? idx,
                x: b.x ?? 0,
                y: b.y ?? 0,
                dx: b.dx ?? 0,
                dy: b.dy ?? 0,
                radius: b.radius ?? 10,
                inverseMass: b.inverseMass ?? 1.0,
            };
        });
        
        // Store server targets for smooth blending in simulate()
        for (let i = 0; i < serverBalls.length; i++) {
            const server = serverBalls[i]!;
            this.serverBallTargets.set(i, {
                x: server.x,
                y: server.y,
                dx: server.dx,
                dy: server.dy,
            });
        }
        
        // Update ball states with smooth interpolation
        for (let i = 0; i < Math.min(this.balls.length, serverBalls.length); i++) {
            const local = this.balls[i]!;
            const server = serverBalls[i]!;
            
            // Calculate position error
            const posError = Math.sqrt(
                Math.pow(local.x - server.x, 2) + Math.pow(local.y - server.y, 2)
            );
            
            // DEBUG: Log significant corrections
            if (posError > 5) {
                console.log(`[RECONCILE] Ball ${i}: error=${posError.toFixed(1)}px, local=(${local.x.toFixed(0)},${local.y.toFixed(0)}) server=(${server.x.toFixed(0)},${server.y.toFixed(0)})`);
            }
            
            // Use CONTINUOUS blend factor based on error (no discrete thresholds)
            // This avoids jitter when error fluctuates around threshold boundaries
            // Formula: blend = min(0.5, 0.02 + error * 0.008)
            // At 0 error: 0.02, at 10px: 0.10, at 50px: 0.42, capped at 0.5
            const blendFactor = Math.min(0.5, 0.02 + posError * 0.008);
            
            // Only blend if error is noticeable (> 2px)
            // Below that, trust client simulation completely for smoothest motion
            if (posError > 2) {
                local.x = local.x + (server.x - local.x) * blendFactor;
                local.y = local.y + (server.y - local.y) * blendFactor;
            }
            
            // VELOCITY: Only sync if direction actually changed (bounce happened)
            // Check if velocity DIRECTION differs (dot product < 0 means opposite direction)
            const localSpeed = Math.sqrt(local.dx * local.dx + local.dy * local.dy);
            const serverSpeed = Math.sqrt(server.dx * server.dx + server.dy * server.dy);
            
            if (localSpeed > 0.1 && serverSpeed > 0.1) {
                // Normalize and check dot product
                const dotProduct = (local.dx * server.dx + local.dy * server.dy) / (localSpeed * serverSpeed);
                
                // If dot product < 0.3, velocities are significantly different direction (bounce happened)
                // Using 0.3 instead of 0.5 to be more conservative about bounce detection
                if (dotProduct < 0.3) {
                    // Bounce detected - snap velocity immediately for correct direction
                    console.log(`[BOUNCE] Ball ${i}: dotProduct=${dotProduct.toFixed(2)}, snapping velocity`);
                    local.dx = server.dx;
                    local.dy = server.dy;
                }
                // Otherwise: DON'T touch velocity - let prediction run with its own velocity
                // This prevents unnatural curves mid-flight
            } else {
                // One or both speeds are near zero - just sync
                local.dx = server.dx;
                local.dy = server.dy;
            }
            
            // Always sync radius (powerups can change it)
            local.radius = server.radius;
        }
        
        // Handle ball count changes (always do this)
        if (serverBalls.length > this.balls.length) {
            // Server has more balls, add them
            for (let i = this.balls.length; i < serverBalls.length; i++) {
                this.balls.push(serverBalls[i]!);
            }
        } else if (serverBalls.length < this.balls.length) {
            // Server has fewer balls, remove extras
            this.balls.length = serverBalls.length;
        }
        
        // Parse and reconcile paddles (for non-local players)
        const serverPaddles = (serverState.paddles || []).map((p: any, idx: number) => {
            if (Array.isArray(p)) {
                return {
                    paddle_id: p[7] ?? idx,
                    owner_id: p[7] ?? idx,
                    x: p[0] ?? 0,
                    y: p[1] ?? 0,
                    r: p[2] ?? 0,
                    w: p[3] ?? 10,
                    l: p[4] ?? 50,
                    vx: p[5] ?? 0,
                    vy: p[6] ?? 0,
                    speed: p[8] ?? 150,
                };
            }
            return {
                paddle_id: p.paddle_id ?? p.owner_id ?? idx,
                owner_id: p.owner_id ?? p.paddle_id ?? idx,
                x: p.x ?? 0,
                y: p.y ?? 0,
                r: p.r ?? 0,
                w: p.w ?? 10,
                l: p.l ?? 50,
                vx: p.vx ?? 0,
                vy: p.vy ?? 0,
                speed: p.speed ?? 150,
            };
        });
        
        for (let i = 0; i < Math.min(this.paddles.length, serverPaddles.length); i++) {
            const local = this.paddles[i]!;
            const server = serverPaddles[i]!;
            
            // Always sync speed from server (can change due to powerups)
            local.speed = server.speed;
            
            // For our own paddle, trust local prediction for smooth movement
            // Only correct if we're significantly out of sync
            if (local.owner_id === this.myUserId) {
                const posDiff = Math.sqrt(
                    Math.pow(local.x - server.x, 2) + Math.pow(local.y - server.y, 2)
                );
                
                // Only snap if we're very far off (indicates desync)
                if (posDiff > 30) {
                    local.x = server.x;
                    local.y = server.y;
                }
                // Keep our local velocity for responsiveness - don't touch it
            } else {
                // Other players' paddles: smooth interpolation
                local.x = local.x + (server.x - local.x) * interpolationFactor;
                local.y = local.y + (server.y - local.y) * interpolationFactor;
                local.vx = server.vx;
                local.vy = server.vy;
            }
        }
        
        // Update elapsed time from server
        if (serverState.metadata?.elapsedTime !== undefined) {
            this.elapsedTime = serverState.metadata.elapsedTime;
        }
    }

    /**
     * Get the current state in the format expected by the renderer
     */
    public getState(): {
        board_id: number | null;
        balls: Array<{ id: number; x: number; y: number; dx: number; dy: number; radius: number }>;
        paddles: Array<{ paddle_id: number; owner_id: number; x: number; y: number; r: number; w: number; l: number }>;
        edges: Array<{ x: number; y: number }>;
        metadata: { elapsedTime: number };
    } {
        // Convert walls to edges (using pointA of each wall)
        const edges = this.walls.map(w => ({ x: w.ax, y: w.ay }));
        
        return {
            board_id: this.boardId,
            balls: this.balls.map(b => ({
                id: b.id,
                x: b.x,
                y: b.y,
                dx: b.dx,
                dy: b.dy,
                radius: b.radius,
            })),
            paddles: this.paddles.map(p => ({
                paddle_id: p.paddle_id,
                owner_id: p.owner_id,
                x: p.x,
                y: p.y,
                r: p.r,
                w: p.w,
                l: p.l,
            })),
            edges,
            metadata: {
                elapsedTime: this.elapsedTime,
            },
        };
    }

    /**
     * Check if simulation has been initialized
     */
    public isInitialized(): boolean {
        return this.balls.length > 0 && this.walls.length > 0;
    }

    /**
     * Get elapsed time
     */
    public getElapsedTime(): number {
        return this.elapsedTime;
    }

    /**
     * BULLETPROOF: Check if any balls have escaped bounds and reset them to center.
     * This prevents visual glitches from balls tunneling through walls.
     */
    private checkBallBounds(): void {
        const canvasSize = this.state.metadata?.gameOptions?.canvasWidth ?? 800;
        const margin = 50;
        const minBound = -margin;
        const maxBound = canvasSize + margin;
        const center = canvasSize / 2;

        for (const ball of this.balls) {
            if (ball.x < minBound || ball.x > maxBound || ball.y < minBound || ball.y > maxBound) {
                console.warn(`[ClientSim] BULLETPROOF: Ball escaped bounds at (${ball.x.toFixed(1)}, ${ball.y.toFixed(1)}) - resetting`);
                
                // Reset to center with random-ish direction based on current velocity
                ball.x = center;
                ball.y = center;
                
                // Keep current speed but flip direction toward center
                const speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
                if (speed > 0.01) {
                    // Just reverse direction
                    ball.dx = -ball.dx;
                    ball.dy = -ball.dy;
                }
            }
        }
    }
}
