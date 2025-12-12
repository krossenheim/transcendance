// Client-side Pong simulation that mirrors the server physics
// This runs locally for smooth visuals while the server remains authoritative

import { Vec2, EPS } from "./math";
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
     */
    public simulate(deltaTime: number): void {
        let timeRemaining = Math.min(this.gameOptions.gameDuration - this.elapsedTime, deltaTime) * this.timeScale;
        if (timeRemaining <= 0) return;
        
        const maxIterations = 100;
        let iterations = 0;
        
        while (timeRemaining > EPS && iterations < maxIterations) {
            iterations++;
            
            // Find the next collision
            const collision = this.findNextCollision(timeRemaining);
            
            if (collision === null || collision.time > timeRemaining) {
                // No collision in remaining time, just move everything
                this.moveObjects(timeRemaining);
                this.elapsedTime += timeRemaining / this.timeScale;
                break;
            }
            
            // Move to collision point
            this.moveObjects(collision.time);
            this.elapsedTime += collision.time / this.timeScale;
            timeRemaining -= collision.time;
            
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
                
                if (tHit !== null && tHit >= 0 && tHit <= maxTime) {
                    if (earliest === null || tHit < earliest.time) {
                        earliest = { time: tHit, type: 'wall', ballIdx: i, targetIdx: j };
                    }
                }
            }
            
            // Check ball-paddle collisions (paddles are rectangles, simplified as lines)
            for (let j = 0; j < this.paddles.length; j++) {
                const paddle = this.paddles[j]!;
                const paddleLines = this.getPaddleLines(paddle);
                
                for (const line of paddleLines) {
                    // Account for paddle velocity
                    const relVelocity = ballVelocity.sub(new Vec2(paddle.vx, paddle.vy));
                    const tHit = getWallCollisionTime(ballCenter, ball.radius, relVelocity, line.a, line.b);
                    
                    if (tHit !== null && tHit >= 0 && tHit <= maxTime) {
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
                
                if (tHit !== null && tHit >= 0 && tHit <= maxTime) {
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
        // Move balls
        for (const ball of this.balls) {
            ball.x += ball.dx * deltaTime;
            ball.y += ball.dy * deltaTime;
        }
        
        // Move paddles
        for (const paddle of this.paddles) {
            paddle.x += paddle.vx * deltaTime;
            paddle.y += paddle.vy * deltaTime;
        }
    }

    /**
     * Resolve a collision
     */
    private resolveCollision(collision: { time: number; type: string; ballIdx: number; targetIdx?: number }): void {
        const ball = this.balls[collision.ballIdx]!;
        
        // Larger nudge to prevent ball getting stuck (especially in paddles)
        const nudgeTime = 0.001; // 1ms worth of movement
        
        switch (collision.type) {
            case 'wall': {
                const wall = this.walls[collision.targetIdx!]!;
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
                } else {
                    // Nudge ball away from wall using new velocity direction
                    ball.x += ball.dx * nudgeTime;
                    ball.y += ball.dy * nudgeTime;
                }
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
                
                // Larger nudge for paddle collisions to prevent getting stuck
                // Move ball away from paddle center
                const ballCenter = new Vec2(ball.x, ball.y);
                const paddleCenter = new Vec2(paddle.x, paddle.y);
                const awayFromPaddle = ballCenter.sub(paddleCenter).normalize();
                
                // Nudge in direction away from paddle AND in velocity direction
                ball.x += ball.dx * nudgeTime + awayFromPaddle.x * 2;
                ball.y += ball.dy * nudgeTime + awayFromPaddle.y * 2;
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
                
                // Nudge both balls apart
                ball.x += ball.dx * nudgeTime;
                ball.y += ball.dy * nudgeTime;
                other.x += other.dx * nudgeTime;
                other.y += other.dy * nudgeTime;
                break;
            }
        }
    }

    /**
     * Reconcile local state with server state (smooth correction)
     */
    public reconcileWithServer(serverState: any, interpolationFactor: number = 0.3): void {
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
        
        // Interpolate ball positions toward server state
        for (let i = 0; i < Math.min(this.balls.length, serverBalls.length); i++) {
            const local = this.balls[i]!;
            const server = serverBalls[i]!;
            
            // Calculate position difference
            const posDiff = Math.sqrt(Math.pow(local.x - server.x, 2) + Math.pow(local.y - server.y, 2));
            
            // Calculate velocity difference  
            const velDiff = Math.sqrt(Math.pow(local.dx - server.dx, 2) + Math.pow(local.dy - server.dy, 2));
            
            // If difference is large (> 80 units), snap to server position (major desync)
            if (posDiff > 80) {
                local.x = server.x;
                local.y = server.y;
                local.dx = server.dx;
                local.dy = server.dy;
            } else if (posDiff > 5) {
                // Gentle interpolation for medium differences
                // Use smaller factor to avoid sudden jumps
                const smoothFactor = Math.min(interpolationFactor, posDiff / 100);
                local.x = local.x + (server.x - local.x) * smoothFactor;
                local.y = local.y + (server.y - local.y) * smoothFactor;
            }
            // For small differences (< 5 units), trust local prediction
            
            // Velocity correction - only if significantly different
            if (velDiff > 20) {
                local.dx = local.dx + (server.dx - local.dx) * interpolationFactor * 0.3;
                local.dy = local.dy + (server.dy - local.dy) * interpolationFactor * 0.3;
            }
            
            // Always sync radius
            local.radius = server.radius;
        }
        
        // Handle ball count changes
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
