import { MultiObject, LineObject, CircleObject } from "../engine/baseObjects.js";
import { getWallCollisionTime } from "../engine/collision.js";
import { Vec2 } from "../engine/math.js";

type PongPaddleKeyData = {
    key: string;
    isPressed: boolean;
    isClockwise: boolean;
}

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

		const topLine = new LineObject(
			center.add(paddleDirection.normalize().perp().mul(-halfWidth)).add(paddleDirection.normalize().mul(-halfHeight)),
			center.add(paddleDirection.normalize().perp().mul(-halfWidth)).add(paddleDirection.normalize().mul(halfHeight)),
			new Vec2(0, 0),
			0,
			1.0,
		)

		const bottomLine = new LineObject(
			center.add(paddleDirection.normalize().perp().mul(halfWidth)).add(paddleDirection.normalize().mul(-halfHeight)),
			center.add(paddleDirection.normalize().perp().mul(halfWidth)).add(paddleDirection.normalize().mul(halfHeight)),
			new Vec2(0, 0),
			0,
			1.0,
		)

		const leftLine = new LineObject(
			center.add(paddleDirection.normalize().perp().mul(-halfWidth)).add(paddleDirection.normalize().mul(-halfHeight)),
			center.add(paddleDirection.normalize().perp().mul(halfWidth)).add(paddleDirection.normalize().mul(-halfHeight)),
			new Vec2(0, 0),
			0,
			1.0,
		)

		const rightLine = new LineObject(
			center.add(paddleDirection.normalize().perp().mul(-halfWidth)).add(paddleDirection.normalize().mul(halfHeight)),
			center.add(paddleDirection.normalize().perp().mul(halfWidth)).add(paddleDirection.normalize().mul(halfHeight)),
			new Vec2(0, 0),
			0,
			1.0,
		)

		const topLeftCorner = new CircleObject(
			center.add(paddleDirection.normalize().perp().mul(-halfWidth)).add(paddleDirection.normalize().mul(-halfHeight)),
			0,
			new Vec2(0, 0),
			0,
			1.0,
		);

		const topRightCorner = new CircleObject(
			center.add(paddleDirection.normalize().perp().mul(-halfWidth)).add(paddleDirection.normalize().mul(halfHeight)),
			0,
			new Vec2(0, 0),
			0,
			1.0,
		);

		const bottomLeftCorner = new CircleObject(
			center.add(paddleDirection.normalize().perp().mul(halfWidth)).add(paddleDirection.normalize().mul(-halfHeight)),
			0,
			new Vec2(0, 0),
			0,
			1.0,
		);

		const bottomRightCorner = new CircleObject(
			center.add(paddleDirection.normalize().perp().mul(halfWidth)).add(paddleDirection.normalize().mul(halfHeight)),
			0,
			new Vec2(0, 0),
			0,
			1.0,
		);

		super([topLine, bottomLine, leftLine, rightLine, topLeftCorner, topRightCorner, bottomLeftCorner, bottomRightCorner], new Vec2(0, 0), 0, 1.0);
		this.clockwiseBaseVelocity = paddleDirection.clone().perp().normalize();
		this.keyData = [];
		this.playerId = -1;

		const maxTravelDistance = Math.min(
			getWallCollisionTime(new CircleObject(center.sub(paddleDirection.normalize().mul(halfHeight)), 10, paddleDirection.perp().normalize().mul(-1)), walls[0]!) || Infinity,
			getWallCollisionTime(new CircleObject(center.sub(paddleDirection.normalize().mul(halfHeight)), 10, paddleDirection.perp().normalize().mul(1)), walls[1]!) || Infinity,
			getWallCollisionTime(new CircleObject(center.add(paddleDirection.normalize().mul(halfHeight)), 10, paddleDirection.perp().normalize().mul(-1)), walls[0]!) || Infinity,
			getWallCollisionTime(new CircleObject(center.add(paddleDirection.normalize().mul(halfHeight)), 10, paddleDirection.perp().normalize().mul(1)), walls[1]!) || Infinity,
			protectedWallWidth / 2,
		) - halfWidth - 1;

		this.bounds = {
			min: center.sub(paddleDirection.normalize().perp().mul(maxTravelDistance)),
			max: center.add(paddleDirection.normalize().perp().mul(maxTravelDistance)),
		};

		const isTopHalf = (new Vec2(0, -1).dot(paddleDirection) > 0);
		this.keyData = [
			{ key: "ArrowLeft", isPressed: false, isClockwise: !isTopHalf },
			{ key: "ArrowRight", isPressed: false, isClockwise: isTopHalf },
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
			this.velocity = new Vec2(0, 0);
			return Infinity;
		}

		const desiredVelocity = this.clockwiseBaseVelocity.normalize().mul(moveDirection * this.boardPaddleSpeed);
		const maxTravelDistance = moveDirection > 0 ? this.bounds.max.sub(this.getCenter()).len() : this.getCenter().sub(this.bounds.min).len();

		if (maxTravelDistance < 1) {
			this.velocity = new Vec2(0, 0);
			return Infinity;
		}

		const maxTravelTime = maxTravelDistance / desiredVelocity.len();
		this.velocity = desiredVelocity;
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

	public toJSON(): any {
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
		]
	}
}
