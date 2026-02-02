import { MultiObject, LineObject, CircleObject } from "../engine/baseObjects.js";
import { getWallCollisionTime } from "../engine/collision.js";
import { Vec2, EPS } from "../engine/math.js";

// Toggle heavy paddle logging for debugging (set to `true` only when debugging).
const ENABLE_PADDLE_LOGS = false;

type PongPaddleKeyData = {
	key: string;
	isPressed: boolean;
	isClockwise: boolean;
}

type PongPaddleJSON = [
	number, // center.x
	number, // center.y
	number, // paddleAngle
	number, // paddleWidth
	number, // paddleHeight
	number, // velocity.x
	number, // velocity.y
	number, // playerId
	number, // boardPaddleSpeed
];

const scaledDesiredVelocity = new Vec2(0, 0);

export class PongPaddle extends MultiObject {
	public keyData: PongPaddleKeyData[];
	public playerId: number;
	public clockwiseBaseVelocity: Vec2;
	public bounds: { min: Vec2; max: Vec2 };
	public paddleWidth: number;
	public paddleHeight: number;
	public paddleAngle: number;

	private readonly basePaddleSpeed: number;
	private boardPaddleSpeed: number;
	private reverseControls: boolean = false;

	constructor(center: Vec2, width: number, height: number, paddleDirection: Vec2, protectedWallWidth: number, paddleSpeedFactor: number, walls: LineObject[] = [], playerId: number) {
		const halfWidth = width / 2;
		const halfHeight = height / 2;

		const paddelPerpPositive = paddleDirection.clone().normalize().perp().mul(halfWidth);
		const paddelPerpNegative = paddleDirection.clone().normalize().perp().mul(-halfWidth);
		const paddelNormalized = paddleDirection.clone().normalize().mul(halfHeight);
		const paddelNegNormalized = paddleDirection.clone().normalize().mul(-halfHeight);
		const copyCenter = new Vec2(center.x, center.y);

		const topLine = new LineObject(
			copyCenter.set(center.x, center.y).add(paddelPerpNegative).add(paddelNegNormalized).clone(),
			copyCenter.set(center.x, center.y).add(paddelPerpNegative).add(paddelNormalized).clone(),
			new Vec2(0, 0),
			0,
			1.0,
		)

		const bottomLine = new LineObject(
			copyCenter.set(center.x, center.y).add(paddelPerpPositive).add(paddelNegNormalized).clone(),
			copyCenter.set(center.x, center.y).add(paddelPerpPositive).add(paddelNormalized).clone(),
			new Vec2(0, 0),
			0,
			1.0,
		)

		const leftLine = new LineObject(
			copyCenter.set(center.x, center.y).add(paddelPerpNegative).add(paddelNegNormalized).clone(),
			copyCenter.set(center.x, center.y).add(paddelPerpPositive).add(paddelNegNormalized).clone(),
			new Vec2(0, 0),
			0,
			1.0,
		)

		const rightLine = new LineObject(
			copyCenter.set(center.x, center.y).add(paddelPerpNegative).add(paddelNormalized).clone(),
			copyCenter.set(center.x, center.y).add(paddelPerpPositive).add(paddelNormalized).clone(),
			new Vec2(0, 0),
			0,
			1.0,
		)

		const topLeftCorner = new CircleObject(
			copyCenter.set(center.x, center.y).add(paddelPerpNegative).add(paddelNegNormalized).clone(),
			0,
			new Vec2(0, 0),
			0,
			1.0,
		);

		const topRightCorner = new CircleObject(
			copyCenter.set(center.x, center.y).add(paddelPerpNegative).add(paddelNormalized).clone(),
			0,
			new Vec2(0, 0),
			0,
			1.0,
		);

		const bottomLeftCorner = new CircleObject(
			copyCenter.set(center.x, center.y).add(paddelPerpPositive).add(paddelNegNormalized).clone(),
			0,
			new Vec2(0, 0),
			0,
			1.0,
		);

		const bottomRightCorner = new CircleObject(
			copyCenter.set(center.x, center.y).add(paddelPerpPositive).add(paddelNormalized).clone(),
			0,
			new Vec2(0, 0),
			0,
			1.0,
		);

		super([topLine, bottomLine, leftLine, rightLine, topLeftCorner, topRightCorner, bottomLeftCorner, bottomRightCorner], new Vec2(0, 0), 0, 1.0);
		this.clockwiseBaseVelocity = paddleDirection.clone().perp().normalize();
		this.keyData = [];
		this.playerId = -1;

		const paddleDirectionCopy = paddleDirection.clone();
		const maxTravelDistance = Math.min(
			getWallCollisionTime(new CircleObject(copyCenter.set(center.x, center.y).sub(paddelNormalized), 10, paddleDirectionCopy.set(paddleDirection.x, paddleDirection.y).perp().normalize().mul(-1)), walls[0]!) || Infinity,
			getWallCollisionTime(new CircleObject(copyCenter.set(center.x, center.y).sub(paddelNormalized), 10, paddleDirectionCopy.set(paddleDirection.x, paddleDirection.y).perp().normalize().mul(1)), walls[1]!) || Infinity,
			getWallCollisionTime(new CircleObject(copyCenter.set(center.x, center.y).add(paddelNormalized), 10, paddleDirectionCopy.set(paddleDirection.x, paddleDirection.y).perp().normalize().mul(-1)), walls[0]!) || Infinity,
			getWallCollisionTime(new CircleObject(copyCenter.set(center.x, center.y).add(paddelNormalized), 10, paddleDirectionCopy.set(paddleDirection.x, paddleDirection.y).perp().normalize().mul(1)), walls[1]!) || Infinity,
			protectedWallWidth / 2,
		) - halfWidth - 1;
		if (ENABLE_PADDLE_LOGS) console.log("Max travel distance:", maxTravelDistance);

		this.bounds = {
			min: copyCenter.set(center.x, center.y).sub(paddleDirectionCopy.set(paddleDirection.x, paddleDirection.y).normalize().perp().mul(maxTravelDistance)).clone(),
			max: copyCenter.set(center.x, center.y).add(paddleDirectionCopy.set(paddleDirection.x, paddleDirection.y).normalize().perp().mul(maxTravelDistance)).clone(),
		};
		if (ENABLE_PADDLE_LOGS) console.log("Paddle bounds:", this.bounds, this.getCenter());

		const isTopHalf = (new Vec2(0, -1).dot(paddleDirection) > 0);
		this.keyData = [
			{ key: "arrowleft", isPressed: false, isClockwise: !isTopHalf },
			{ key: "arrowright", isPressed: false, isClockwise: isTopHalf },
		]
		this.basePaddleSpeed = protectedWallWidth * paddleSpeedFactor;
		this.boardPaddleSpeed = protectedWallWidth * paddleSpeedFactor;
		this.paddleHeight = height;
		this.paddleWidth = width;
		this.paddleAngle = paddleDirection.angle();
		this.playerId = playerId;
	}

	private getCenter(): Vec2 {
		let sum = new Vec2(0, 0);
		let count = 0;
		for (const obj of this.objects) {
			if (obj instanceof LineObject) {
				sum = sum.add(obj.pointA).add(obj.pointB);
				count += 2;
			} else if (obj instanceof CircleObject) {
				sum = sum.add(obj.center);
				count += 1;
			}
		}
		return sum.div(count);
	}

	public setReverseControls(reverse: boolean): void {
		this.reverseControls = reverse;
	}

	/// Update the paddle velocity based on the current key states and the given paddle speed. Return the amount of time this move will maximally take before hitting the bounds.
	public updatePaddleVelocity(): number {
		let moveDirection = 0;
		for (const keyData of this.keyData) {
			if (keyData.isPressed) {
				moveDirection += (keyData.isClockwise !== this.reverseControls) ? 1 : -1;
			}
		}

		if (moveDirection === 0) {
			this.velocity.set(0, 0);
			return Infinity;
		}

		let maxTravelDistance = 0;
		const center = this.getCenter();
		if (moveDirection > 0) {
			maxTravelDistance = center.distanceTo(this.bounds.max) - this.paddleWidth / 2;
			const totalLength = this.bounds.max.distanceTo(this.bounds.min);
			const otherSideDist = center.distanceTo(this.bounds.min) + this.paddleWidth / 2;
			if (otherSideDist > totalLength)
				maxTravelDistance = 0;
		} else {
			maxTravelDistance = center.distanceTo(this.bounds.min) - this.paddleWidth / 2;
			const totalLength = this.bounds.max.distanceTo(this.bounds.min);
			const otherSideDist = center.distanceTo(this.bounds.max) + this.paddleWidth / 2;
			if (otherSideDist > totalLength)
				maxTravelDistance = 0;
		}

		scaledDesiredVelocity.copy(this.clockwiseBaseVelocity).normalize().mul(moveDirection * this.boardPaddleSpeed);
		const maxTravelTime = maxTravelDistance / scaledDesiredVelocity.len();

		if (maxTravelTime < EPS) {
			if (ENABLE_PADDLE_LOGS) console.log("Paddle cannot move further in this direction");
			this.velocity.set(0, 0);
			return Infinity;
		}

		this.velocity.set(scaledDesiredVelocity.x, scaledDesiredVelocity.y);
		return maxTravelTime;
	}

	public getSpeed(): number {
		return this.boardPaddleSpeed;
	}

	public getBaseSpeed(): number {
		return this.basePaddleSpeed;
	}

	public setSpeed(newSpeed: number): void {
		this.boardPaddleSpeed = newSpeed;
	}

	public toJSON(): PongPaddleJSON {
		const center = this.getCenter();
		const velocity = this.velocity;
		return [
			center.x,
			center.y,
			this.paddleAngle,
			this.paddleWidth,
			this.paddleHeight,
			velocity.x,
			velocity.y,
			this.playerId,
			this.boardPaddleSpeed,
		]
	}

	public addLeftKey(key: string): void {
		this.keyData.push({ key: key, isPressed: false, isClockwise: true });
	}

	public addRightKey(key: string): void {
		this.keyData.push({ key: key, isPressed: false, isClockwise: false });
	}
}
