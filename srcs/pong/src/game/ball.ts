import { BaseObject, CircleObject } from "../engine/baseObjects.js";
import { CollisionResponse } from "../engine/collision.js";
import { Vec2 } from "../engine/math.js";

export class PongBall extends CircleObject {
    private static idCounter = 0;
    public readonly id: number;

    constructor(center: Vec2, radius: number, velocity: Vec2) {
        super(center, radius, velocity, 1.0 / (Math.PI * radius * radius), 1.0);
        this.id = PongBall.idCounter++;

        this.setCollisionHandler((other: BaseObject) => {
            return CollisionResponse.BOUNCE;
        });
    }

    public toJSON(): any {
        return [
            this.center.x,
            this.center.y,
            this.velocity.x,
            this.velocity.y,
            this.radius,
            this.inverseMass,
        ]
    }
}
