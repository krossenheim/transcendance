import { BaseObject, CircleObject } from "../engine/baseObjects.js";
import { CollisionResponse } from "../engine/collision.js";
import { Vec2, EPS } from "../engine/math.js";
import { Scene } from "../engine/scene.js";
import { SeededRandom } from "../engine/random.js";

import { Wall, PlayerWall } from "./wall.js";
import { PongPaddle } from "./paddle.js";
import { PongBall } from "./ball.js";

const ENABLE_GAME_LOGS = false;

export const TICK_RATE = 120;
export const TICK_DURATION = 1 / TICK_RATE;

export type PongGameOptions = {
    canvasWidth: number;
    canvasHeight: number;
    ballSpeed: number;
    paddleSpeedFactor: number;
    paddleWidthFactor: number;
    paddleHeight: number;
    paddleWallOffset?: number;
    amountOfBalls?: number;
    powerupFrequency: number;
    gameDuration: number;
    maxScore?: number;
    seed?: number;
    gameMode?: string;
}

export enum PowerupType {
    ADD_BALL,
    INCREASE_PADDLE_SPEED,
    DECREASE_PADDLE_SPEED,
    SUPER_SPEED,
    INCREASE_BALL_SIZE,
    DECREASE_BALL_SIZE,
    REVERSE_CONTROLS,
}

type PowerupData = {
    type: PowerupType;
    chance: number;
    durationTicks: number | null;
}

const POWERUP_DURATION_TICKS = 10 * TICK_RATE;

const powerupData: PowerupData[] = [
    { type: PowerupType.ADD_BALL, chance: 40, durationTicks: null },
    { type: PowerupType.INCREASE_BALL_SIZE, chance: 40, durationTicks: null },
    { type: PowerupType.INCREASE_PADDLE_SPEED, chance: 25, durationTicks: POWERUP_DURATION_TICKS },
    { type: PowerupType.DECREASE_PADDLE_SPEED, chance: 25, durationTicks: POWERUP_DURATION_TICKS },
    { type: PowerupType.DECREASE_BALL_SIZE, chance: 20, durationTicks: null },
    { type: PowerupType.SUPER_SPEED, chance: 15, durationTicks: POWERUP_DURATION_TICKS },
    { type: PowerupType.REVERSE_CONTROLS, chance: 15, durationTicks: POWERUP_DURATION_TICKS },
];
const totalPowerupChance = powerupData.reduce((sum, p) => sum + p.chance, 0);

export class Powerup extends CircleObject {
    private activationTick: number | null = null;
    private metadata: PowerupData;
    private spawnTick: number;
    private game: PongGame;

    constructor(center: Vec2, radius: number, velocity: Vec2, powerup: PowerupData, game: PongGame) {
        super(center, radius, velocity, 0.5, 1.0);
        this.metadata = powerup;
        this.game = game;
        this.spawnTick = game.getCurrentTick();

        this.setCollisionHandler((other: BaseObject) => {
            if (other instanceof PongBall) {
                if (this.activationTick === null) {
                    if (ENABLE_GAME_LOGS) console.log(`Powerup of type ${PowerupType[this.metadata.type]} collected by ball ID ${other.id}.`);
                    this.game.applyPowerupEffect(this, other);
                    return CollisionResponse.RESET;
                }
                return CollisionResponse.IGNORE;
            }

            return CollisionResponse.IGNORE;
        });
    }

    static generateRandomPowerup(center: Vec2, velocity: Vec2, game: PongGame): Powerup {
        let randomPowerupIndex = game.getRng().next() * totalPowerupChance;
        let newPowerup: PowerupData | undefined = undefined;
        for (const powerup of powerupData) {
            if (randomPowerupIndex < powerup.chance) {
                newPowerup = powerup;
                break;
            }
            randomPowerupIndex -= powerup.chance;
        }

        if (newPowerup === undefined) {
            newPowerup = powerupData[0]!;
        }

        return new Powerup(center, 20, velocity, newPowerup, game);
    }

    public getPowerupType(): PowerupType {
        return this.metadata.type;
    }

    public activate(currentTick: number): void {
        this.activationTick = currentTick;
    }

    public isPowerupActive(currentTick: number): boolean {
        if (this.activationTick === null || this.metadata.durationTicks === null) return false;
        return (currentTick - this.activationTick) < this.metadata.durationTicks;
    }

    public isPowerupTaken(): boolean {
        return this.activationTick !== null;
    }

    public isTimeBased(): boolean {
        return this.metadata.durationTicks !== null;
    }

    public getRemainingPowerupTicks(currentTick: number): number {
        if (this.activationTick === null) return 0;
        if (this.metadata.durationTicks === null) return Infinity;
        const elapsed = currentTick - this.activationTick;
        return Math.max(0, this.metadata.durationTicks - elapsed);
    }

    public toJSON(): any {
        return [
            this.center.x,
            this.center.y,
            this.velocity.x,
            this.velocity.y,
            this.radius,
            this.spawnTick,
            this.metadata.type,
            this.metadata.durationTicks,
            this.activationTick,
        ]
    }
}

const scaledAPos = new Vec2(0, 0);
const scaledBPos = new Vec2(0, 0);
const scaledSegLen = new Vec2(0, 0);
const scaledBsq = new Vec2(0, 0);
const scaledCsq = new Vec2(0, 0);
const scaledPaddleCenter = new Vec2(0, 0);
const scratchSpawnDir = new Vec2(0, 0);
const scratchSpawnPos = new Vec2(0, 0);

export class PongGame {
    private static instanceCount: number = 0;
    public readonly id: number = ++PongGame.instanceCount;

    private walls: (Wall | PlayerWall)[] = [];
    private balls: PongBall[] = [];
    private powerups: Powerup[] = [];
    private paddles: PongPaddle[] = [];
    private scene: Scene = new Scene();
    private score: Map<number, number> = new Map();

    private gameOptions: PongGameOptions;
    private nextPowerupSpawnTick: number = 0;
    private powerupSpawnRadius: number = 0;
    private players: number[];

    private recentPowerupEvents: { type: number; typeName: string; tick: number }[] = [];
    private static readonly RECENT_EVENT_TICKS = 3 * TICK_RATE;

    private currentTick: number = 0;
    private tickRemainder: number = 0;
    private rng: SeededRandom;
    private eliminatedPlayers: Set<number> = new Set();
    private pendingEliminations: number[] = [];
    private allOriginalPlayers: number[] = [];
    private ballsPendingReset: Set<PongBall> = new Set();

    private fetchWallSegments(): number[] {
        if (this.players.length === 0)
            return [-1, -1, -1, -1];
        else if (this.players.length === 1)
            return [-1, -1, this.players[0]!, -1];
        else if (this.players.length === 2)
            return [-1, this.players[1]!, -1, this.players[0]!];

        return Array.from(this.players);
    }

    private createWallSegment(pointA: Vec2, pointB: Vec2, playerId: number): Wall | PlayerWall {
        if (playerId === -1) {
            const wall = new Wall(pointA.clone(), pointB.clone());
            wall.setCollisionHandler((other: BaseObject): CollisionResponse => {
                return CollisionResponse.BOUNCE;
            });
            return wall;
        } else {
            const wall = new PlayerWall(pointA.clone(), pointB.clone(), playerId);
            wall.setCollisionHandler((other: BaseObject): CollisionResponse => {
                return CollisionResponse.BOUNCE;
            });
            return wall;
        }
    }

    private constructPlayingField(): void {
        const size = Math.min(this.gameOptions.canvasWidth, this.gameOptions.canvasHeight);
        const halfSize = size / 2;
        const center = new Vec2(Math.floor(this.gameOptions.canvasWidth / 2), Math.floor(this.gameOptions.canvasHeight / 2));

        const wallSegments: number[] = this.fetchWallSegments();
        const halfAngleStep = Math.PI / wallSegments.length;
        const angleStep = (2 * Math.PI) / wallSegments.length;

        if (ENABLE_GAME_LOGS) {
        }

        for (let i = 0; i < wallSegments.length; i++) {
            scaledAPos.copy(center).addScaled(new Vec2(0, -1).rotate(i * angleStep - halfAngleStep), halfSize);
            scaledBPos.copy(center).addScaled(new Vec2(0, -1).rotate(i * angleStep + halfAngleStep), halfSize);
            const wall = this.createWallSegment(scaledAPos, scaledBPos, wallSegments[i]!);
            this.walls.push(wall);
            this.scene.addObject(wall);
        }

        let powerupBaseRadius = Infinity;
        for (let i = 0; i < wallSegments.length; i++) {
            if (wallSegments[i] === -1) continue;
            scaledAPos.copy(center).addScaled(new Vec2(0, -1).rotate(i * angleStep - halfAngleStep), halfSize);
            scaledBPos.copy(center).addScaled(new Vec2(0, -1).rotate(i * angleStep + halfAngleStep), halfSize);
            const bSq = (scaledBsq.copy(scaledBPos).sub(scaledAPos).len() / 2) ** 2;
            const cSq = (scaledCsq.copy(scaledAPos).sub(center).lenSq());
            const aSq = cSq - bSq;

            const closestDistanceWallToCenter = Math.sqrt(Math.max(0, aSq));
            powerupBaseRadius = Math.min(powerupBaseRadius, closestDistanceWallToCenter);

            const wallLength = scaledSegLen.copy(scaledBPos).sub(scaledAPos).len();
            const playerPaddleSize = (this.gameOptions.paddleWidthFactor || 0.3) * wallLength;
            const playerPaddleOffset = this.gameOptions.paddleWallOffset || 50;
            scaledPaddleCenter.copy(center).addScaled(new Vec2(0, -1).rotate(i * angleStep), closestDistanceWallToCenter - playerPaddleOffset);
            const paddle = new PongPaddle(scaledPaddleCenter, playerPaddleSize, this.gameOptions.paddleHeight, new Vec2(0, -1).rotate(i * angleStep).normalize(), wallLength, this.gameOptions.paddleSpeedFactor, [this.walls[(i - 1 + this.walls.length) % this.walls.length]!, this.walls[(i + 1) % this.walls.length]!], wallSegments[i]!);
            this.paddles.push(paddle);
            this.scene.addObject(paddle);
            if (ENABLE_GAME_LOGS) {
            }
        }

        this.powerupSpawnRadius = powerupBaseRadius - (this.gameOptions.paddleHeight / 2 + 160);
    }

    private spawnNewBall(position: Vec2, velocity: Vec2, radius: number, inverseMass: number, gameOptions: PongGameOptions): void {
        const ball = new PongBall(position, radius, velocity);
        ball.setCollisionHandler((other: BaseObject, elapsedTime: number): CollisionResponse => {
            if (this.ballsPendingReset.has(ball)) {
                return CollisionResponse.IGNORE;
            }
            if (other instanceof PlayerWall) {
                if (this.eliminatedPlayers.has(other.playerId)) {
                    return CollisionResponse.BOUNCE;
                }
                const wall = this.walls.find(w => w === other);
                if (wall) {
                    const oldScore = this.score.get(other.playerId) || 0;
                    this.score.set(other.playerId, oldScore - 1);
                    if (ENABLE_GAME_LOGS) console.log(`[PongGame] Player ${other.playerId} conceded. Score ${oldScore} -> ${oldScore - 1}`);

                    if (this.gameOptions.gameMode === 'lastOneStanding') {
                        if (!this.eliminatedPlayers.has(other.playerId) && !this.pendingEliminations.includes(other.playerId)) {
                            this.pendingEliminations.push(other.playerId);
                        }
                        return CollisionResponse.BOUNCE;
                    }
                    this.scene.removeObject(ball);
                    ball.center.set(-99999, -99999);
                    ball.velocity.set(0, 0);
                    this.ballsPendingReset.add(ball);
                    return CollisionResponse.IGNORE;
                }
            }
            return CollisionResponse.BOUNCE;
        });

        ball.inverseMass = inverseMass;
        if (ENABLE_GAME_LOGS) {
        }
        this.balls.push(ball);
        this.scene.addObject(ball);
    }

    private spawnNewPowerup(): void {
        if (ENABLE_GAME_LOGS) console.log(this.powerupSpawnRadius);
        const angle = this.rng.nextAngle();
        const distance = Math.sqrt(this.rng.next()) * this.powerupSpawnRadius;

        scratchSpawnDir.set(1, 0).rotate(angle).mul(distance);
        scratchSpawnPos.set(this.gameOptions.canvasWidth / 2, this.gameOptions.canvasHeight / 2).add(scratchSpawnDir);;
        const powerup = Powerup.generateRandomPowerup(scratchSpawnPos.clone(), new Vec2(0, 0), this);
        this.powerups.push(powerup);
        this.scene.addObject(powerup);
        if (ENABLE_GAME_LOGS) console.log(`Spawned new powerup of type ${PowerupType[powerup.getPowerupType()]} at position (${scratchSpawnPos.x.toFixed(2)}, ${scratchSpawnPos.y.toFixed(2)}).`);
    }

    constructor(players: number[], gameOptions: PongGameOptions) {
        this.walls = [];
        this.balls = [];
        this.paddles = [];
        this.powerups = [];
        this.players = Array.from(players);
        this.allOriginalPlayers = Array.from(players);
        this.gameOptions = gameOptions;

        this.scene = new Scene(gameOptions.ballSpeed, gameOptions.canvasWidth / 2, gameOptions.canvasHeight / 2);

        this.rng = gameOptions.seed !== undefined
            ? new SeededRandom(gameOptions.seed)
            : SeededRandom.withRandomSeed();

        this.currentTick = 0;

        this.nextPowerupSpawnTick = Math.floor(gameOptions.powerupFrequency * TICK_RATE);

        this.score = new Map();
        for (const playerId of players) {
            this.score.set(playerId, 0);
        }

        this.constructPlayingField();

        const amountOfBalls = Math.max(1, gameOptions.amountOfBalls || 1);
        for (let i = 0; i < amountOfBalls; i++) {
            const ballDirection = new Vec2(0, -1).rotate(this.rng.nextAngle());
            this.spawnNewBall(new Vec2(gameOptions.canvasWidth / 2, gameOptions.canvasHeight / 2), ballDirection.mul(gameOptions.ballSpeed), 10, 1.0, gameOptions);
        }
    }

    public playSimulation(deltaTime: number): void {
        this.cleanUpExpiredPowerups(this.currentTick);

        if (this.currentTick >= this.nextPowerupSpawnTick) {
            this.spawnNewPowerup();
            const baseFrequencyTicks = Math.floor(this.gameOptions.powerupFrequency * TICK_RATE);
            const jitterFactor = 0.8 + this.rng.next() * 0.4;
            this.nextPowerupSpawnTick = this.currentTick + Math.floor(baseFrequencyTicks * jitterFactor);
        }

        let leftOverTime = deltaTime;
        let safetyIterations = 2000;
        while (leftOverTime > EPS && safetyIterations-- > 0) {
            let timeStep = leftOverTime;
            const timeScale = this.scene.getTimeScale();
            for (const paddle of this.paddles) {
                const paddleMaxTime = paddle.updatePaddleVelocity() / timeScale;
                timeStep = Math.min(paddleMaxTime, timeStep);
            }

            if (timeStep < 1e-6 && leftOverTime > timeStep * 10) {
                timeStep = leftOverTime;
            }

            this.scene.playSimulation(timeStep, this.balls);
            leftOverTime -= timeStep;
        }

        if (this.ballsPendingReset.size > 0) {
            const centerX = this.gameOptions.canvasWidth / 2;
            const centerY = this.gameOptions.canvasHeight / 2;
            const pendingCount = this.ballsPendingReset.size;
            let ballIndex = 0;
            for (const ball of this.ballsPendingReset) {
                const angle = this.rng.nextAngle();
                // Spread balls apart when multiple reset simultaneously to avoid overlap
                const offset = pendingCount > 1 ? (ballIndex / pendingCount) * 2 * Math.PI : 0;
                const spreadDistance = pendingCount > 1 ? ball.radius * 3 : 0;
                ball.center.set(
                    centerX + Math.cos(offset) * spreadDistance,
                    centerY + Math.sin(offset) * spreadDistance
                );
                ball.velocity.set(0, -1).rotate(angle).mul(this.gameOptions.ballSpeed);
                this.scene.addObject(ball);
                if (ENABLE_GAME_LOGS) console.log(`[PongGame] Reset ball to center (${ball.center.x.toFixed(1)},${ball.center.y.toFixed(1)}) with new velocity (${ball.velocity.x.toFixed(1)},${ball.velocity.y.toFixed(1)})`);
                ballIndex++;
            }
            this.ballsPendingReset.clear();
        }

        while (this.pendingEliminations.length > 0) {
            const playerId = this.pendingEliminations.shift()!;
            if (ENABLE_GAME_LOGS) console.log(`[PongGame] Processing deferred elimination of player ${playerId}. Active: [${this.players.join(',')}], Eliminated: [${Array.from(this.eliminatedPlayers).join(',')}]`);
            this.eliminatePlayer(playerId);
            if (ENABLE_GAME_LOGS) console.log(`[PongGame] After elimination. Active: [${this.players.join(',')}], Eliminated: [${Array.from(this.eliminatedPlayers).join(',')}], isGameOver: ${this.isGameOver()}`);
        }

        this.checkBallBounds();

        this.fixStuckBalls();

        this.tickRemainder += deltaTime * TICK_RATE;
        const wholeTicks = Math.floor(this.tickRemainder);
        this.tickRemainder -= wholeTicks;
        this.currentTick += Math.max(1, wholeTicks);

    }

    private checkBallBounds(): void {
        const margin = 50;
        const minBound = -margin;
        const maxBoundX = this.gameOptions.canvasWidth + margin;
        const maxBoundY = this.gameOptions.canvasHeight + margin;
        const centerX = this.gameOptions.canvasWidth / 2;
        const centerY = this.gameOptions.canvasHeight / 2;

        for (const ball of this.balls) {
            const x = ball.center.x;
            const y = ball.center.y;

            if (x < minBound || x > maxBoundX || y < minBound || y > maxBoundY) {
                if (ENABLE_GAME_LOGS) console.warn(`[PongGame] BULLETPROOF: Ball escaped bounds at (${x.toFixed(1)}, ${y.toFixed(1)}) - resetting to center`);

                ball.center.set(centerX, centerY);
                const newDirection = new Vec2(0, -1).rotate(this.rng.nextAngle());
                ball.velocity.copy(newDirection.mul(this.gameOptions.ballSpeed));
            }
        }
    }

    private fixStuckBalls(): void {
        const centerX = this.gameOptions.canvasWidth / 2;
        const centerY = this.gameOptions.canvasHeight / 2;

        for (const ball of this.balls) {
            const vx = ball.velocity.x;
            const vy = ball.velocity.y;
            const px = ball.center.x;
            const py = ball.center.y;

            const hasNaN = !Number.isFinite(vx) || !Number.isFinite(vy) ||
                           !Number.isFinite(px) || !Number.isFinite(py);

            const speed = Math.sqrt(vx * vx + vy * vy);
            const hasZeroVelocity = speed < EPS;

            if (hasNaN || hasZeroVelocity) {
                if (ENABLE_GAME_LOGS) console.warn(`[PongGame] BULLETPROOF: Stuck ball detected! NaN=${hasNaN} zeroVel=${hasZeroVelocity} pos=(${px},${py}) vel=(${vx},${vy}) - resetting to center`);
                ball.center.set(centerX, centerY);
                const newDirection = new Vec2(0, -1).rotate(this.rng.nextAngle());
                ball.velocity.copy(newDirection.mul(this.gameOptions.ballSpeed));
            }
        }
    }

    public applyPowerupEffect(powerup: Powerup, ball: PongBall): void {
        const powerupType = powerup.getPowerupType();

        let effectApplied = true;

        switch (powerupType) {
            case PowerupType.ADD_BALL:
                if (ENABLE_GAME_LOGS) console.log(`Spawning new ball due to powerup effect.`);
                const angleOffset = this.rng.nextFloat(-Math.PI / 8, Math.PI / 8);
                this.spawnNewBall(ball.center.clone(), ball.velocity.clone().rotate(angleOffset), ball.radius, ball.inverseMass, this.gameOptions);
                break;

            case PowerupType.INCREASE_PADDLE_SPEED:
                this.paddles.forEach(paddle => paddle.setSpeed(paddle.getSpeed() * 2));
                break;

            case PowerupType.DECREASE_PADDLE_SPEED:
                this.paddles.forEach(paddle => paddle.setSpeed(paddle.getSpeed() * 0.5));
                break;

            case PowerupType.SUPER_SPEED:
                this.scene.setTimeScale(this.scene.getTimeScale() * 1.5);
                break;

            case PowerupType.INCREASE_BALL_SIZE:
                if (ball.radius >= 50) {
                    effectApplied = false;
                    if (ENABLE_GAME_LOGS) console.log(`Ball size already at max (${ball.radius}), skipping INCREASE_BALL_SIZE`);
                } else {
                    ball.radius *= 1.5;
                    ball.inverseMass = 1.0 / (Math.PI * ball.radius * ball.radius);
                    if (ENABLE_GAME_LOGS) console.log(`Ball size increased to ${ball.radius}`);
                }
                break;

            case PowerupType.DECREASE_BALL_SIZE:
                if (ball.radius <= 3) {
                    effectApplied = false;
                    if (ENABLE_GAME_LOGS) console.log(`Ball size already at min (${ball.radius}), skipping DECREASE_BALL_SIZE`);
                } else {
                    ball.radius *= 0.75;
                    ball.inverseMass = 1.0 / (Math.PI * ball.radius * ball.radius);
                    if (ENABLE_GAME_LOGS) console.log(`Ball size decreased to ${ball.radius}`);
                }
                break;

            case PowerupType.REVERSE_CONTROLS:
                this.paddles.forEach(paddle => paddle.setReverseControls(true));
                break;
        }

        if (effectApplied && !powerup.isTimeBased()) {
            this.recentPowerupEvents.push({
                type: powerupType,
                typeName: PowerupType[powerupType],
                tick: this.currentTick,
            });
        }

        powerup.activate(this.currentTick);
    }

    public removePowerupEffects(powerup: Powerup): void {
        switch (powerup.getPowerupType()) {
            case PowerupType.INCREASE_PADDLE_SPEED:
                this.paddles.forEach(paddle => paddle.setSpeed(paddle.getSpeed() / 2));
                break;

            case PowerupType.DECREASE_PADDLE_SPEED:
                this.paddles.forEach(paddle => paddle.setSpeed(paddle.getSpeed() * 2));
                break;

            case PowerupType.SUPER_SPEED:
                this.scene.setTimeScale(this.scene.getTimeScale() / 1.5);
                break;

            case PowerupType.REVERSE_CONTROLS:
                this.paddles.forEach(paddle => paddle.setReverseControls(false));
                break;

            default:
                if (powerup.isTimeBased()) {
                    console.warn(`Powerup of type ${PowerupType[powerup.getPowerupType()]} has no removal effect defined.`);
                }
                break;
        }
    }

    private cleanUpExpiredPowerups(currentTick: number): void {
        for (let i = this.powerups.length - 1; i >= 0; i--) {
            const powerup = this.powerups[i]!;
            const isActive = powerup.isPowerupActive(currentTick);
            const isTaken = powerup.isPowerupTaken();

            const shouldRemove = !isActive && isTaken;
            if (shouldRemove) {
                if (ENABLE_GAME_LOGS) console.log(`Removing expired powerup of type ${PowerupType[powerup.getPowerupType()]}.`);

                this.scene.removeObject(powerup);
                this.removePowerupEffects(powerup);

                const lastIndex = this.powerups.length - 1;
                if (i !== lastIndex) {
                    this.powerups[i] = this.powerups[lastIndex]!;
                }
                this.powerups.pop();
            }
        }
    }

    public fetchPlayerScoreMap(): Map<number, number> {
        const scoreMap: Map<number, number> = new Map();

        for (const [playerId, playerScore] of this.score.entries()) {
            for (const otherPlayerId of this.score.keys()) {
                if (otherPlayerId === playerId) continue;
                scoreMap.set(otherPlayerId, (scoreMap.get(otherPlayerId) || 0) + Math.abs(playerScore));
            }
        }

        for (const playerId of scoreMap.keys()) {
            if (!this.players.includes(playerId) && !this.eliminatedPlayers.has(playerId)) {
                scoreMap.set(playerId, -1);
            }
        }

        return scoreMap;
    }

    public eliminatePlayer(playerId: number): void {
        if (this.eliminatedPlayers.has(playerId)) return;
        this.eliminatedPlayers.add(playerId);

        for (const paddle of this.paddles.filter(paddle => paddle.playerId === playerId))
            this.scene.removeObject(paddle);
        this.paddles = this.paddles.filter(paddle => paddle.playerId !== playerId);

        const playerWalls = this.walls.filter(wall => wall instanceof PlayerWall && wall.playerId === playerId);
        for (const wall of playerWalls) {
            wall.setCollisionHandler((other: BaseObject): CollisionResponse => {
                if (ENABLE_GAME_LOGS) console.log(`Ball collided with eliminated player ${playerId}'s wall (now solid).`);
                return CollisionResponse.BOUNCE;
            });
        }

        this.players = this.players.filter(id => id !== playerId);
    }

    public removePlayer(playerId: number): void {
        for (const paddle of this.paddles.filter(paddle => paddle.playerId === playerId))
            this.scene.removeObject(paddle);
        this.paddles = this.paddles.filter(paddle => paddle.playerId !== playerId);

        const playerWalls = this.walls.filter(wall => wall instanceof PlayerWall && wall.playerId === playerId);
        for (const wall of playerWalls) {
            this.scene.removeObject(wall);

            const newWall = new Wall(wall.pointA.clone(), wall.pointB.clone());
            newWall.setCollisionHandler((other: BaseObject): CollisionResponse => {
                if (ENABLE_GAME_LOGS) console.log(`Ball collided with a neutral wall.`);
                return CollisionResponse.BOUNCE;
            });
            this.walls.push(newWall);
            this.scene.addObject(newWall);
        }
        this.walls = this.walls.filter(wall => !(wall instanceof PlayerWall && wall.playerId === playerId));
        this.players = this.players.filter(id => id !== playerId);
    }

    public fetchBoardJSON(): any {
        const activeEffects: { type: number; typeName: string; remainingTicks: number; remainingSeconds: number }[] = [];
        for (const powerup of this.powerups) {
            if (powerup.isPowerupTaken() && powerup.isPowerupActive(this.currentTick)) {
                const remainingTicks = powerup.getRemainingPowerupTicks(this.currentTick);
                activeEffects.push({
                    type: powerup.getPowerupType(),
                    typeName: PowerupType[powerup.getPowerupType()],
                    remainingTicks: remainingTicks,
                    remainingSeconds: remainingTicks / TICK_RATE,
                });
            }
        }

        this.recentPowerupEvents = this.recentPowerupEvents.filter(
            event => (this.currentTick - event.tick) < PongGame.RECENT_EVENT_TICKS
        );
        const recentEvents = this.recentPowerupEvents.map(event => ({
            type: event.type,
            typeName: event.typeName,
            ageSeconds: (this.currentTick - event.tick) / TICK_RATE,
        }));

        return {
            board_id: this.id,
            boardId: this.id,
            metadata: {
                gameOptions: this.gameOptions,
                elapsedTime: this.getElapsedTime(),
                currentTick: this.currentTick,
                seed: this.rng.getSeed(),
                players: this.players,
                allPlayers: this.allOriginalPlayers,
                eliminatedPlayers: Array.from(this.eliminatedPlayers),
                id: this.id,
                timeScale: this.scene.getTimeScale(),
            },
            walls: this.walls.map(wall => wall.toJSON()),
            balls: this.balls.map(ball => ball.toJSON()),
            paddles: this.paddles.map(paddle => paddle.toJSON()),
            powerups: this.powerups.filter(powerup => !powerup.isPowerupTaken()).map(powerup => powerup.toJSON()),
            activeEffects: activeEffects,
            recentEvents: recentEvents,
            score: Object.fromEntries(this.fetchPlayerScoreMap()),
            serverTime: Date.now(),
            gameOver: this.isGameOver(),
            winner: this.isGameOver() ? this.getWinner() : null,
        }
    }

    public getPlayers(): number[] {
        return Array.from(this.players);
    }

    public getAllPlayerIds(): Set<number> {
        return new Set(this.allOriginalPlayers);
    }

    public getPlayerPaddles(playerId: number): PongPaddle[] {
        return Array.from(this.paddles.filter(paddle => paddle.playerId === playerId));
    }

    public handlePressedKeysForPlayer(keys: string[], playerId: number): void {
        const playerPaddles = this.getPlayerPaddles(playerId);
        for (const paddle of playerPaddles) {
            for (const keyData of paddle.keyData) {
                keyData.isPressed = keys.includes(keyData.key.toLowerCase());
            }
        }
    }

    public isGameOver(): boolean {
        if (this.players.length <= 1) {
            return true;
        }
        if (this.gameOptions.gameMode === 'lastOneStanding') {
            return false;
        }
        const gameDurationTicks = Math.floor(this.gameOptions.gameDuration * TICK_RATE);
        if (this.currentTick >= gameDurationTicks) {
            return true;
        }
        if (this.gameOptions.maxScore && this.gameOptions.maxScore > 0) {
            const scoreMap = this.fetchPlayerScoreMap();
            for (const score of scoreMap.values()) {
                if (score >= this.gameOptions.maxScore) {
                    return true;
                }
            }
        }
        return false;
    }

    public getWinner(): number | null {
        if (this.gameOptions.gameMode === 'lastOneStanding') {
            return this.players.length === 1 ? this.players[0]! : null;
        }
        const scoreMap = this.fetchPlayerScoreMap();
        let maxScore = -Infinity;
        let winnerId: number | null = null;

        for (const [playerId, score] of scoreMap.entries()) {
            if (score > maxScore) {
                maxScore = score;
                winnerId = playerId;
            }
        }

        return winnerId;
    }

    public getCurrentTick(): number {
        return this.currentTick;
    }

    public getRng(): SeededRandom {
        return this.rng;
    }

    public getElapsedTime(): number {
        return this.currentTick * TICK_DURATION;
    }

}

