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
                console.log(`[ClientSim] Paddle ${idx} speed from server: ${parsedSpeed} (raw p[8]: ${p[8]})`);
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
     */
    private updatePaddleVelocities(): void {
        for (const paddle of this.paddles) {
            if (paddle.owner_id !== this.myUserId) continue;
            
            // Determine movement direction based on keys
            // The server uses isTopHalf to determine which direction each key moves the paddle
            // isTopHalf = (Vec2(0, -1).dot(paddleDirection) > 0)
            // paddleDirection is derived from paddle.r (the angle)
            const paddleDir = new Vec2(Math.cos(paddle.r), Math.sin(paddle.r));
            const isTopHalf = (new Vec2(0, -1).dot(paddleDir) > 0);
            
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
                const clockwiseBaseVelocity = paddleDir.perp().normalize();
                const moveVec = clockwiseBaseVelocity.mul(moveDirection * paddle.speed);
                paddle.vx = moveVec.x;
                paddle.vy = moveVec.y;
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
        
        // Debug: log actual speed being simulated (every 60 frames = ~1 second)
        ClientPongSimulation.debugFrameCount++;
        if (this.balls.length > 0 && ClientPongSimulation.debugFrameCount % 60 === 0) {
            const ball = this.balls[0]!;
            const speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy);
            // Store on window for easy inspection
            (window as any).PREDICTION_SPEED = { speed: speed.toFixed(1), dx: ball.dx.toFixed(1), dy: ball.dy.toFixed(1), timeScale: this.timeScale, frame: ClientPongSimulation.debugFrameCount };
            console.error(`🔵 PREDICTION | Speed: ${speed.toFixed(1)} | dx: ${ball.dx.toFixed(1)} | dy: ${ball.dy.toFixed(1)} | timeScale: ${this.timeScale}`);
        }
        
        // Match server's max iterations (1000)
        const maxIterations = 1000;
        let iterations = 0;
        
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
            
            // Server moves objects by FAT_EPS BEFORE resolving collision
            this.moveObjects(FAT_EPS);
            
            // Resolve collision
            this.resolveCollision(collision);
        }
    }

    /**
     * Find the next collision in the simulation
     */
    private findNextCollision(maxTime: number): { time: number; type: string; ballIdx: number; targetIdx?: number } | null {
        let earliest: { time: number; type: string; ballIdx: number; targetIdx?: number } | null = null;
        
        for (let i = 0; i < this.balls.length; i++) {
            const ball = this.balls[i]!;
            const ballCenter = new Vec2(ball.x, ball.y);
            const ballVelocity = new Vec2(ball.dx, ball.dy);
            
            // Check ball-wall collisions
            for (let j = 0; j < this.walls.length; j++) {
                const wall = this.walls[j]!;
                const wallA = new Vec2(wall.ax, wall.ay);
                const wallB = new Vec2(wall.bx, wall.by);
                
                const tHit = getWallCollisionTime(ballCenter, ball.radius, ballVelocity, wallA, wallB);
                
                // Match server: only check if tHit is not null/NaN, and if it's earliest
                if (tHit !== null && !isNaN(tHit) && tHit <= maxTime) {
                    if (earliest === null || tHit < earliest.time) {
                        earliest = { time: tHit, type: 'wall', ballIdx: i, targetIdx: j };
                    }
                }
            }
            
            // Check ball-paddle collisions (paddles are rectangles, simplified as lines)
            for (let j = 0; j < this.paddles.length; j++) {
                const paddle = this.paddles[j]!;
                const paddleLines = this.getPaddleLines(paddle);
                const paddleVelocity = new Vec2(paddle.vx, paddle.vy);
                
                for (const line of paddleLines) {
                    // Pass paddle velocity as wall velocity so relative velocity is computed correctly
                    const tHit = getWallCollisionTime(ballCenter, ball.radius, ballVelocity, line.a, line.b, paddleVelocity);
                    
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
                const otherCenter = new Vec2(other.x, other.y);
                const otherVelocity = new Vec2(other.dx, other.dy);
                
                const tHit = getBallCollisionTime(ballCenter, ball.radius, ballVelocity, otherCenter, other.radius, otherVelocity);
                
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
     * Get the lines that make up a paddle for collision detection
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
     * Server moves objects by FAT_EPS BEFORE calling this, so no post-nudge needed
     */
    private resolveCollision(collision: { time: number; type: string; ballIdx: number; targetIdx?: number }): void {
        const ball = this.balls[collision.ballIdx]!;
        
        switch (collision.type) {
            case 'wall': {
                const wall = this.walls[collision.targetIdx!]!;
                
                // Note: We no longer track pendingBounce here - sync is based on server ball position
                
                const ballObj = {
                    center: new Vec2(ball.x, ball.y),
                    velocity: new Vec2(ball.dx, ball.dy),
                    inverseMass: ball.inverseMass,
                    restitution: 1.0,
                    radius: ball.radius,
                };
                
                const wallObj = {
                    pointA: new Vec2(wall.ax, wall.ay),
                    pointB: new Vec2(wall.bx, wall.by),
                    velocity: new Vec2(0, 0),
                    inverseMass: 0,
                    restitution: 1.0,
                };
                
                resolveCircleLineCollision(ballObj, wallObj);
                
                ball.dx = ballObj.velocity.x;
                ball.dy = ballObj.velocity.y;
                
                // If this is a player wall, reset ball to center (simplified - server handles scoring)
                if (wall.playerId !== null) {
                    ball.x = this.gameOptions.canvasWidth / 2;
                    ball.y = this.gameOptions.canvasHeight / 2;
                    const angle = Math.random() * 2 * Math.PI;
                    ball.dx = Math.cos(angle) * this.gameOptions.ballSpeed;
                    ball.dy = Math.sin(angle) * this.gameOptions.ballSpeed;
                }
                // No nudge needed - already done in main loop before resolution
                break;
            }
            
            case 'paddle': {
                const paddle = this.paddles[collision.targetIdx!]!;
                const paddleVelocity = new Vec2(paddle.vx, paddle.vy);
                
                // Find the collision line (simplified: use main face)
                const dir = new Vec2(Math.cos(paddle.r), Math.sin(paddle.r));
                const perp = dir.perp();
                const halfWidth = paddle.w / 2;
                
                // Front face of paddle
                const faceA = new Vec2(paddle.x, paddle.y).add(perp.mul(-halfWidth));
                const faceB = new Vec2(paddle.x, paddle.y).add(perp.mul(halfWidth));
                
                const ballObj = {
                    center: new Vec2(ball.x, ball.y),
                    velocity: new Vec2(ball.dx, ball.dy),
                    inverseMass: ball.inverseMass,
                    restitution: 1.0,
                    radius: ball.radius,
                };
                
                const paddleLine = {
                    pointA: faceA,
                    pointB: faceB,
                    velocity: paddleVelocity,
                    inverseMass: 0,
                    restitution: 1.0,
                };
                
                resolveCircleLineCollision(ballObj, paddleLine);
                
                ball.dx = ballObj.velocity.x;
                ball.dy = ballObj.velocity.y;
                // No nudge needed - already done in main loop before resolution
                break;
            }
            
            case 'ball': {
                const other = this.balls[collision.targetIdx!]!;
                
                const ballA = {
                    center: new Vec2(ball.x, ball.y),
                    velocity: new Vec2(ball.dx, ball.dy),
                    inverseMass: ball.inverseMass,
                    restitution: 1.0,
                    radius: ball.radius,
                };
                
                const ballB = {
                    center: new Vec2(other.x, other.y),
                    velocity: new Vec2(other.dx, other.dy),
                    inverseMass: other.inverseMass,
                    restitution: 1.0,
                    radius: other.radius,
                };
                
                resolveBallCollision(ballA, ballB);
                
                ball.dx = ballA.velocity.x;
                ball.dy = ballA.velocity.y;
                other.dx = ballB.velocity.x;
                other.dy = ballB.velocity.y;
                // No nudge needed - already done in main loop before resolution
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
            
            // Debug: log position error occasionally
            if (ClientPongSimulation.debugFrameCount % 60 === 0 && i === 0) {
                (window as any).PREDICTION_ERROR = { posError: posError.toFixed(1), localX: local.x.toFixed(1), serverX: server.x.toFixed(1) };
                console.error(`🟡 SYNC ERROR | posErr: ${posError.toFixed(1)}px | local: (${local.x.toFixed(0)},${local.y.toFixed(0)}) | server: (${server.x.toFixed(0)},${server.y.toFixed(0)})`);
            }
            
            // Dynamic interpolation: blend faster when error is large
            // Small error (< 10px): blend slowly (0.05) - almost imperceptible
            // Medium error (10-50px): blend moderately (0.15)
            // Large error (> 50px): blend fast (0.4)
            let blendFactor: number;
            if (posError < 10) {
                blendFactor = 0.05;
            } else if (posError < 50) {
                blendFactor = 0.15;
            } else {
                blendFactor = 0.4;
            }
            
            // Smooth blend position only
            local.x = local.x + (server.x - local.x) * blendFactor;
            local.y = local.y + (server.y - local.y) * blendFactor;
            
            // VELOCITY: Only sync if direction actually changed (bounce happened)
            // Check if velocity DIRECTION differs (dot product < 0 means opposite direction)
            const localSpeed = Math.sqrt(local.dx * local.dx + local.dy * local.dy);
            const serverSpeed = Math.sqrt(server.dx * server.dx + server.dy * server.dy);
            
            if (localSpeed > 0.1 && serverSpeed > 0.1) {
                // Normalize and check dot product
                const dotProduct = (local.dx * server.dx + local.dy * server.dy) / (localSpeed * serverSpeed);
                
                // If dot product < 0.5, velocities are significantly different direction (bounce happened)
                if (dotProduct < 0.5) {
                    // Bounce detected - snap velocity immediately for correct direction
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
}
