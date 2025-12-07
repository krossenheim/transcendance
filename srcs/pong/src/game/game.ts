// Engine imports
import { BaseObject, CircleObject } from "../engine/baseObjects.js";
import { CollisionResponse } from "../engine/collision.js";
import { Vec2, EPS } from "../engine/math.js";
import { Scene } from "../engine/scene.js";

// Game imports
import { Wall, PlayerWall } from "./wall.js";
import { PongPaddle } from "./paddle.js";
import { PongBall } from "./ball.js";

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

// Increase / decrease ball size

type PowerupData = {
	type: PowerupType;
	chance: number;
	duration: number | null;
}

const powerupData: PowerupData[] = [
	{ type: PowerupType.ADD_BALL, chance: 40, duration: null },
	{ type: PowerupType.INCREASE_BALL_SIZE, chance: 40, duration: null },
	{ type: PowerupType.INCREASE_PADDLE_SPEED, chance: 25, duration: 10 },
	{ type: PowerupType.DECREASE_PADDLE_SPEED, chance: 25, duration: 10 },
	{ type: PowerupType.DECREASE_BALL_SIZE, chance: 20, duration: null },
	{ type: PowerupType.SUPER_SPEED, chance: 15, duration: 10 },
	{ type: PowerupType.REVERSE_CONTROLS, chance: 15, duration: 10 },
];
const totalPowerupChance = powerupData.reduce((sum, p) => sum + p.chance, 0);

export class Powerup extends CircleObject {
	private activationStartTime: number | null = null;
	private metadata: PowerupData;
	private spawnTime: number;
	private game: PongGame;

	constructor(center: Vec2, radius: number, velocity: Vec2, powerup: PowerupData, game: PongGame) {
		super(center, radius, velocity, 0.5, 1.0);
		this.metadata = powerup;
		this.game = game;
		this.spawnTime = game.getScene().getElapsedTime();

		this.setCollisionHandler((other: BaseObject) => {
			if (other instanceof PongBall) {
				console.log(`Powerup of type ${PowerupType[this.metadata.type]} collected by ball ID ${other.id}.`);
				this.game.applyPowerupEffect(this, other);
			}

			return CollisionResponse.RESET;
		});
	}

	static generateRandomPowerup(center: Vec2, velocity: Vec2, game: PongGame): Powerup {
		let randomPowerupIndex = Math.random() * totalPowerupChance;
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

		return new Powerup(center, 10, velocity, newPowerup, game);
	}

	public getPowerupType(): PowerupType {
		return this.metadata.type;
	}

	public activate(currentTime: number): void {
		this.activationStartTime = currentTime;
	}

	public isPowerupActive(currentTime: number): boolean {
		if (this.activationStartTime === null || this.metadata.duration === null) return false;
		return (currentTime - this.activationStartTime + EPS) < this.metadata.duration;
	}

	public isPowerupTaken(): boolean {
		return this.activationStartTime !== null;
	}

	public isTimeBased(): boolean {
		return this.metadata.duration !== null;
	}

	public getRemainingPowerupTime(currentTime: number): number {
		if (this.activationStartTime === null) return 0;
		if (this.metadata.duration === null) return Infinity;
		const elapsed = currentTime - this.activationStartTime;
		return Math.max(0, this.metadata.duration - elapsed);
	}

	public toJSON(): any {
		return [
			this.center.x,
			this.center.y,
			this.velocity.x,
			this.velocity.y,
			this.radius,
			this.spawnTime,
			this.metadata.type,
			this.metadata.duration,
			this.activationStartTime,
		]
	}
}

export class PongGame {
    private static instanceCount: number = 0;
    public readonly id: number = PongGame.instanceCount++;

    private walls: (Wall | PlayerWall)[] = [];
    private balls: PongBall[] = [];
    private powerups: Powerup[] = [];
    private paddles: PongPaddle[] = [];
    private scene: Scene = new Scene();
    private score: Map<number, number> = new Map();

    private gameOptions: PongGameOptions;
    private nextPowerupSpawnTime: number = 0;
    private powerupSpawnRadius: number = 0;
    private players: number[];

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
            const wall = new Wall(pointA, pointB);
            wall.setCollisionHandler((other: BaseObject): CollisionResponse => {
                return CollisionResponse.BOUNCE;
            });
            return wall;
        } else {
            const wall = new PlayerWall(pointA, pointB, playerId);
            wall.setCollisionHandler((other: BaseObject): CollisionResponse => {
                console.log(`Ball collided with player ${playerId}\'s wall.`);
                if (other instanceof PongBall) {
                    this.score.set(playerId, (this.score.get(playerId) || 0) - 1);
                    console.log(`Player ${playerId} conceded a point! Current score: ${this.score.get(playerId)}.`);
                }
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

        for (let i = 0; i < wallSegments.length; i++) {
            const wallStart = center.add(new Vec2(0, -1).rotate(i * angleStep - halfAngleStep).mul(halfSize));
            const wallEnd = center.add(new Vec2(0, -1).rotate(i * angleStep + halfAngleStep).mul(halfSize));
            const wall = this.createWallSegment(wallStart, wallEnd, wallSegments[i]!);
            this.walls.push(wall);
            this.scene.addObject(wall);
        }

        let powerupBaseRadius = Infinity;
        for (let i = 0; i < wallSegments.length; i++) {
            if (wallSegments[i] === -1) continue;
            const wallStart = center.add(new Vec2(0, -1).rotate(i * angleStep - halfAngleStep).mul(halfSize));
            const wallEnd = center.add(new Vec2(0, -1).rotate(i * angleStep + halfAngleStep).mul(halfSize));
            const cSq = wallStart.sub(center).lenSq();
            const bSq = (wallEnd.sub(wallStart).len() / 2) ** 2;
            const aSq = cSq - bSq;

            const closestDistanceWallToCenter =  Math.sqrt(aSq)
            powerupBaseRadius = Math.min(powerupBaseRadius, closestDistanceWallToCenter);

            const playerPaddleSize = (this.gameOptions.paddleWidthFactor || 0.3) * (wallEnd.sub(wallStart).len());
            const playerPaddleOffset = this.gameOptions.paddleWallOffset || 50;
            const paddleCenter = center.add(new Vec2(0, -1).rotate(i * angleStep).mul(closestDistanceWallToCenter - playerPaddleOffset));
            const paddle = new PongPaddle(paddleCenter, playerPaddleSize, this.gameOptions.paddleHeight, new Vec2(0, -1).rotate(i * angleStep).normalize(), wallEnd.sub(wallStart).len(), this.gameOptions.paddleSpeedFactor, [this.walls[(i-1 + this.walls.length) % this.walls.length]!, this.walls[(i+1) % this.walls.length]!], wallSegments[i]!);
            this.paddles.push(paddle);
            this.scene.addObject(paddle);
        }

        this.powerupSpawnRadius = powerupBaseRadius - (this.gameOptions.paddleHeight / 2 + 160);
    }

    private spawnNewBall(position: Vec2, velocity: Vec2, radius: number, inverseMass: number, gameOptions: PongGameOptions): void {
        const ball = new PongBall(position, radius, velocity);
        ball.setCollisionHandler((other: BaseObject, elapsedTime: number): CollisionResponse => {
            if (other instanceof PlayerWall) {
                const wall = this.walls.find(w => w === other);
                if (wall) {
                    ball.center = new Vec2(gameOptions.canvasWidth / 2, gameOptions.canvasHeight / 2);
                    ball.velocity = new Vec2(0, -1).rotate(Math.random() * 2 * Math.PI).mul(gameOptions.ballSpeed);
                    return CollisionResponse.IGNORE;
                }
            }
            return CollisionResponse.BOUNCE;
        });

        ball.inverseMass = inverseMass;
        this.balls.push(ball);
        this.scene.addObject(ball);
    }

    private spawnNewPowerup(): void {
        console.log(this.powerupSpawnRadius);
        const position = (new Vec2(1, 0).rotate(Math.random() * 2 * Math.PI)).mul(Math.sqrt(Math.random()) * this.powerupSpawnRadius).add(new Vec2(this.gameOptions.canvasWidth / 2, this.gameOptions.canvasHeight / 2));
        const velocity = new Vec2(0, 0);
        const powerup = Powerup.generateRandomPowerup(position, velocity, this);
        this.powerups.push(powerup);
        this.scene.addObject(powerup);
        console.log(`Spawned new powerup of type ${PowerupType[powerup.getPowerupType()]} at position (${position.x.toFixed(2)}, ${position.y.toFixed(2)}).`);
    }

    constructor(players: number[], gameOptions: PongGameOptions) {
        this.walls = [];
        this.balls = [];
        this.paddles = [];
        this.powerups = [];
        this.players = Array.from(players);
        this.gameOptions = gameOptions;

        this.constructPlayingField();

        const amountOfBalls = Math.max(1, gameOptions.amountOfBalls || 1);
        for (let i = 0; i < amountOfBalls; i++) {
            const ballDirection = new Vec2(0, -1).rotate(Math.random() * 2 * Math.PI);
            this.spawnNewBall(new Vec2(gameOptions.canvasWidth / 2, gameOptions.canvasHeight / 2), ballDirection.mul(gameOptions.ballSpeed), 10, 1.0, gameOptions);
        }
    }

    public getScene(): Scene {
        return this.scene;
    }

    public playSimulation(deltaTime: number): void {
        let timeRemaining = deltaTime;
        this.cleanUpExpiredPowerups();

        if (this.scene.getElapsedTime() >= this.nextPowerupSpawnTime) {
            this.spawnNewPowerup();
            this.nextPowerupSpawnTime += this.gameOptions.powerupFrequency * (0.8 + Math.random() * 0.4);
        }

        while (timeRemaining > EPS) {
            let minPaddleTime = Infinity;
            for (const paddle of this.paddles) {
                const paddleTime = paddle.updatePaddleVelocity();
                if (paddleTime < minPaddleTime) {
                    minPaddleTime = paddleTime;
                }
            }

            const stepTime = Math.min(timeRemaining, minPaddleTime);
            this.scene.playSimulation(stepTime, this.balls);
            timeRemaining -= stepTime;
        }
    }

    public applyPowerupEffect(powerup: Powerup, ball: PongBall): void {
        switch (powerup.getPowerupType()) {
            case PowerupType.ADD_BALL:
				console.log(`Spawning new ball due to powerup effect.`);
                this.spawnNewBall(ball.center.clone(), ball.velocity.clone().rotate(Math.random() * Math.PI / 4 - Math.PI / 8), ball.radius, ball.inverseMass, this.gameOptions);
                break;

            case PowerupType.INCREASE_PADDLE_SPEED:
                this.paddles.forEach(paddle => paddle.setSpeed(paddle.getSpeed() * 2));
                break;

            case PowerupType.DECREASE_PADDLE_SPEED:
                this.paddles.forEach(paddle => paddle.setSpeed(paddle.getSpeed() * 0.5));
                break;

            case PowerupType.SUPER_SPEED:
                this.scene.setTimeScale(1.5);
                break;

			case PowerupType.INCREASE_BALL_SIZE:
				if (ball.radius >= 50) break;
				ball.radius *= 1.5;
				ball.inverseMass = 1.0 / (Math.PI * ball.radius * ball.radius);
				break;

			case PowerupType.DECREASE_BALL_SIZE:
				if (ball.radius <= 3) break;
				ball.inverseMass = 1.0 / (Math.PI * ball.radius * ball.radius);
				ball.radius *= 0.75;
				break;

            case PowerupType.REVERSE_CONTROLS:
                this.paddles.forEach(paddle => paddle.setReverseControls(true));
                break;
        }

        powerup.activate(this.scene.getElapsedTime());
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
                this.scene.setTimeScale(1.0);
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

    private cleanUpExpiredPowerups(): void {
        const currentTime = this.scene.getElapsedTime();
        this.powerups = this.powerups.filter(powerup => {
            const couldBeRemoved = !(powerup.isPowerupActive(currentTime) || !powerup.isPowerupTaken());
            if (couldBeRemoved) {
                console.log(`Removing expired powerup of type ${PowerupType[powerup.getPowerupType()]}.`);
                this.scene.removeObject(powerup);
                this.removePowerupEffects(powerup);
            }
            return !couldBeRemoved;
        });
    }

    public handleKeyPress(key: string, isPressed: boolean): void {
        for (const paddle of this.paddles) {
            for (const keyData of paddle.keyData) {
                if (keyData.key !== key) continue;
                keyData.isPressed = isPressed;
            }
        }
    }

    public fetchPlayerScoreMap(): Map<number, number> {
        const allPlayers: Set<number> = new Set();
        for (const paddle of this.paddles)
            allPlayers.add(paddle.playerId);

        const scoreMap: Map<number, number> = new Map();

        for (const basePlayerId of allPlayers) {
            const playerNegativeScore = this.score.get(basePlayerId) || 0;
            if (playerNegativeScore >= 0) continue;

            for (const playerId of allPlayers) {
                if (playerId === basePlayerId) continue;
                scoreMap.set(playerId, (scoreMap.get(playerId) || 0) + Math.abs(playerNegativeScore));
            }
        }

        return scoreMap;
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
				console.log(`Ball collided with a neutral wall.`);
				return CollisionResponse.BOUNCE;
			});
			this.walls.push(newWall);
			this.scene.addObject(newWall);
		}
		this.walls = this.walls.filter(wall => !(wall instanceof PlayerWall && wall.playerId === playerId) );
	}

    public fetchBoardJSON(): any {
        return {
            metadata: {
                gameOptions: this.gameOptions,
                elapsedTime: this.scene.getElapsedTime(),
                players: this.players,
            },
            walls: this.walls.map(wall => wall.toJSON()),
            balls: this.balls.map(ball => ball.toJSON()),
            paddles: this.paddles.map(paddle => paddle.toJSON()),
            powerups: this.powerups.map(powerup => powerup.toJSON()),
            score: Object.fromEntries(this.fetchPlayerScoreMap()),
        }
    }

    public getPlayers(): number[] {
        return Array.from(this.players);
    }
}
