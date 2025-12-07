import { LineObject } from "../engine/baseObjects.js";
import { Vec2 } from "../engine/math.js";

export class PlayerWall extends LineObject {
    public playerId: number;

    constructor(pointA: Vec2, pointB: Vec2, playerId: number) {
        super(pointA, pointB, new Vec2(0, 0), 0, 1.0);
        this.playerId = playerId;
    }

    public toJSON(): any {
        return [
            this.pointA.x,
            this.pointA.y,
            this.pointB.x,
            this.pointB.y,
            this.velocity.x,
            this.velocity.y,
            this.playerId,
        ]
    }
}

export class Wall extends LineObject {
    constructor(pointA: Vec2, pointB: Vec2) {
        super(pointA, pointB, new Vec2(0, 0), 0, 1.0);
    }

    public toJSON(): any {
        return [
            this.pointA.x,
            this.pointA.y,
            this.pointB.x,
            this.pointB.y,
            this.velocity.x,
            this.velocity.y,
            null,
        ]
    }
}