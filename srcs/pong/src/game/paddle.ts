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
		try {
			console.log(`[PongPaddle] ctor center=(${center.x},${center.y}) width=${width} height=${height} protectedWallWidth=${protectedWallWidth} paddleSpeedFactor=${paddleSpeedFactor} playerId=${playerId}`);
		} catch (e) {
			// ignore
		}

		// Defensive sanitization: ensure numeric inputs are finite and sensible.
		if (!Number.isFinite(width) || width <= 0) width = 100;
		if (!Number.isFinite(height) || height <= 0) height = 30;
		if (!Number.isFinite(protectedWallWidth) || protectedWallWidth <= 0) protectedWallWidth = Math.max(width * 2, 200);
		if (!Number.isFinite(paddleSpeedFactor) || paddleSpeedFactor <= 0) paddleSpeedFactor = 1.0;
		if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) {
			center = new Vec2(500, 500);
		}
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
			{ key: "arrowleft", isPressed: false, isClockwise: !isTopHalf },
			{ key: "arrowright", isPressed: false, isClockwise: isTopHalf },
		]
		this.basePaddleSpeed = protectedWallWidth * paddleSpeedFactor;
		this.boardPaddleSpeed = protectedWallWidth * paddleSpeedFactor;
		this.paddleHeight = height;
		this.paddleWidth = width;
		this.paddleAngle = paddleDirection.angle();
		this.playerId = playerId;

		// Post-construction validation: if any component coordinates are non-finite, rebuild a safe axis-aligned paddle
		let bad = false;
		for (const obj of this.objects) {
			if ((obj as any).pointA !== undefined && (obj as any).pointB !== undefined) {
				const a = (obj as any).pointA;
				const b = (obj as any).pointB;
				if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) {
					bad = true; break;
				}
			} else if ((obj as any).center !== undefined) {
				const c = (obj as any).center;
				if (!Number.isFinite(c.x) || !Number.isFinite(c.y) || !Number.isFinite((obj as any).radius)) {
					bad = true; break;
				}
			}
		}

		if (bad) {
			try {
				console.warn(`[PongPaddle] ctor: detected non-finite geometry, rebuilding simple fallback paddle for player=${playerId}`);
			} catch (e) {}
			// Simple axis-aligned fallback around center
			const hw = Math.max(1, width / 2);
			const hh = Math.max(1, height / 2);
			const tl = new LineObject(new Vec2(center.x - hw, center.y - hh), new Vec2(center.x + hw, center.y - hh), new Vec2(0,0), 0, 1.0);
			const bl = new LineObject(new Vec2(center.x - hw, center.y + hh), new Vec2(center.x + hw, center.y + hh), new Vec2(0,0), 0, 1.0);
			const ll = new LineObject(new Vec2(center.x - hw, center.y - hh), new Vec2(center.x - hw, center.y + hh), new Vec2(0,0), 0, 1.0);
			const rl = new LineObject(new Vec2(center.x + hw, center.y - hh), new Vec2(center.x + hw, center.y + hh), new Vec2(0,0), 0, 1.0);
			const tlc = new CircleObject(new Vec2(center.x - hw, center.y - hh), 0, new Vec2(0,0), 0, 1.0);
			const trc = new CircleObject(new Vec2(center.x + hw, center.y - hh), 0, new Vec2(0,0), 0, 1.0);
			const blc = new CircleObject(new Vec2(center.x - hw, center.y + hh), 0, new Vec2(0,0), 0, 1.0);
			const brc = new CircleObject(new Vec2(center.x + hw, center.y + hh), 0, new Vec2(0,0), 0, 1.0);
			this.objects = [tl, bl, ll, rl, tlc, trc, blc, brc];
			this.paddleWidth = width;
			this.paddleHeight = height;
			this.clockwiseBaseVelocity = new Vec2(0, -1);
		}
	}

	private getCenter(): Vec2 {
		let sumX = 0;
		let sumY = 0;
		let count = 0;
		for (let i = 0; i < this.objects.length; ++i) {
			const obj = this.objects[i]!;
			if (obj instanceof LineObject) {
				// Defensive: check for non-finite coordinates on each endpoint
				const a = obj.pointA;
				const b = obj.pointB;
				if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) {
					try {
						const stack = (new Error("stacktrace")).stack;
						console.warn(`[PongPaddle] getCenter: non-finite LineObject at index=${i} A=(${a.x},${a.y}) B=(${b.x},${b.y})`, { stack });
					} catch (e) {}
				}
				sumX += a.x + b.x;
				sumY += a.y + b.y;
				count += 2;
			} else if (obj instanceof CircleObject) {
				const c = obj.center;
				if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) {
					try {
						const stack = (new Error("stacktrace")).stack;
						console.warn(`[PongPaddle] getCenter: non-finite CircleObject at index=${i} C=(${c.x},${c.y}) radius=${(obj as any).radius}`, { stack });
					} catch (e) {}
				}
				sumX += c.x;
				sumY += c.y;
				count += 1;
			}
		}
		return new Vec2(sumX / count, sumY / count);
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
			const v = this.velocity; // mutate existing Vec2 to avoid allocation
			v.x = 0;
			v.y = 0;
			return Infinity;
		}

		// clockwiseBaseVelocity is already normalized in constructor; avoid re-normalizing
		const dir = this.clockwiseBaseVelocity;
		const desiredSpeed = Math.abs(moveDirection) * this.boardPaddleSpeed;

		// Compute center numerically to avoid allocating a Vec2
		let sumX = 0;
		let sumY = 0;
		let count = 0;
		for (const obj of this.objects) {
			if (obj instanceof LineObject) {
				sumX += obj.pointA.x + obj.pointB.x;
				sumY += obj.pointA.y + obj.pointB.y;
				count += 2;
			} else if (obj instanceof CircleObject) {
				sumX += obj.center.x;
				sumY += obj.center.y;
				count += 1;
			}
		}
		const cx = sumX / count;
		const cy = sumY / count;

		const maxTravelDistance = moveDirection > 0 ? Math.hypot(this.bounds.max.x - cx, this.bounds.max.y - cy) : Math.hypot(cx - this.bounds.min.x, cy - this.bounds.min.y);

		if (maxTravelDistance < 1) {
			const v = this.velocity;
			v.x = 0;
			v.y = 0;
			return Infinity;
		}

		const maxTravelTime = maxTravelDistance / desiredSpeed;
		const v = this.velocity;
		v.x = dir.x * moveDirection * this.boardPaddleSpeed;
		v.y = dir.y * moveDirection * this.boardPaddleSpeed;
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
		if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) {
			try {
				const stack = (new Error("stacktrace")).stack;
				console.warn(`[PongPaddle] toJSON: CENTER INVALID player=${this.playerId} center=(${center.x},${center.y}) width=${this.paddleWidth} height=${this.paddleHeight} speed=${this.boardPaddleSpeed}`, { stack });
				// Dump component objects count to help debug
				console.warn(`[PongPaddle] objects.count=${this.objects.length}`);
				for (let i = 0; i < this.objects.length; ++i) {
					const obj = this.objects[i]!;
					if ((obj as any).pointA !== undefined && (obj as any).pointB !== undefined) {
						const a = (obj as any).pointA;
						const b = (obj as any).pointB;
						console.warn(`[PongPaddle] obj[${i}] Line A=(${a.x},${a.y}) B=(${b.x},${b.y})`);
					} else if ((obj as any).center !== undefined) {
						const c = (obj as any).center;
						console.warn(`[PongPaddle] obj[${i}] Circle C=(${c.x},${c.y}) radius=${(obj as any).radius}`);
					} else {
						console.warn(`[PongPaddle] obj[${i}] Unknown type`);
					}
				}
			} catch (e) {
				// swallow
			}
		}
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
