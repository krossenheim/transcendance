import { BaseObject, CircleObject } from "../engine/baseObjects.js";
import { CollisionResponse } from "../engine/collision.js";
import { Vec2 } from "../engine/math.js";

export type PongBallJSON = [
    number, // center.x
    number, // center.y
    number, // velocity.x
    number, // velocity.y
    number, // radius
    number, // inverseMass
    number, // id
];

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

    public toJSON(): PongBallJSON {
        return [
            this.center.x,
            this.center.y,
            this.velocity.x,
            this.velocity.y,
            this.radius,
            this.inverseMass,
            this.id,
        ]
    }

    public updateFromJSON(data: PongBallJSON): this {
        this.center.x = data[0];
        this.center.y = data[1];
        this.velocity.x = data[2];
        this.velocity.y = data[3];
        this.radius = data[4];
        this.inverseMass = data[5];
        // Note: id is read-only, set at construction
        return this;
    }
}
