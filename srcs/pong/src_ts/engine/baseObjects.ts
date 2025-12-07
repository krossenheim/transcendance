import { CollisionResponse } from "./collision.js";
import { Vec2 } from "./math.js";

export class BaseObject {
    private _velocity: Vec2;
    private _inverseMass: number;
    private _restitution: number;

    private parentObject: BaseObject | null = null;

    private collisionHandler: (other: BaseObject, elapsedTime: number) => CollisionResponse = (other: BaseObject, elapsedTime: number) => CollisionResponse.BOUNCE;

    constructor(velocity: Vec2, inverseMass: number = 1.0, restitution: number = 1.0, parentObject: BaseObject | null = null) {
        this._velocity = velocity;
        this._inverseMass = inverseMass;
        this._restitution = restitution;

        this.parentObject = parentObject;
    }

    public get velocity(): Vec2 {
        return this.getParentObject()._velocity;
    }

    public set velocity(v: Vec2) {
        this.getParentObject()._velocity = v;
    }

    public get inverseMass(): number {
        return this.getParentObject()._inverseMass;
    }

    public set inverseMass(m: number) {
        this.getParentObject()._inverseMass = m;
    }

    public get restitution(): number {
        return this.getParentObject()._restitution;
    }

    public set restitution(r: number) {
        this.getParentObject()._restitution = r;
    }

    isPartOfObject(obj: BaseObject): boolean {
        for (const sub of this.iter()) {
            if (sub === obj) return true;
        }
        return false;
    }

    setCollisionHandler(handler: (other: BaseObject, elapsedTime: number) => CollisionResponse): void {
        this.collisionHandler = handler;
    }

    onCollision(other: BaseObject, elapsedTime: number): CollisionResponse {
        return this.collisionHandler(other, elapsedTime);
    }

    moveByDelta(delta: number): void {
        throw new Error("moveByDelta not implemented");
    }

    clone(): BaseObject {
        throw new Error("clone not implemented");
    }

    iter(): BaseObject[] {
        return [this];
    }

    setParentObject(parent: BaseObject): void {
        this.parentObject = parent;
    }

    getParentObject(): BaseObject {
        return this.parentObject?.getParentObject() || this;
    }
}

export class LineObject extends BaseObject {
    public pointA: Vec2;
    public pointB: Vec2;

    constructor(pointA: Vec2, pointB: Vec2, velocity: Vec2, inverseMass: number = 0, restitution: number = 1.0) {
        super(velocity, inverseMass, restitution);
        this.pointA = pointA;
        this.pointB = pointB;
    }

    moveByDelta(delta: number): void {
        const move = this.velocity.mul(delta);
        this.pointA = this.pointA.add(move);
        this.pointB = this.pointB.add(move);
    }

    clone(): LineObject {
        return new LineObject(this.pointA.clone(), this.pointB.clone(), this.velocity.clone(), this.inverseMass, this.restitution);
    }

    iter(): BaseObject[] {
        return [this];
    }
}

export class CircleObject extends BaseObject {
    public center: Vec2;
    public radius: number;

    constructor(center: Vec2, radius: number, velocity: Vec2, inverseMass: number = 1.0, restitution: number = 1.0) {
        super(velocity, inverseMass, restitution);
        this.center = center;
        this.radius = radius;
    }

    moveByDelta(delta: number): void {
        const move = this.velocity.mul(delta);
        this.center = this.center.add(move);
    }

    clone(): CircleObject {
        return new CircleObject(this.center.clone(), this.radius, this.velocity.clone(), this.inverseMass, this.restitution);
    }

    iter(): BaseObject[] {
        return [this];
    }
}

export class MultiObject extends BaseObject {
    public objects: BaseObject[];

    constructor(objects: BaseObject[], velocity: Vec2, inverseMass: number = 1.0, restitution: number = 1.0) {
        super(velocity, inverseMass, restitution);
        this.objects = objects;

        for (const obj of this.objects) {
            obj.setParentObject(this);
        }
    }

    moveByDelta(delta: number): void {
        const move = this.velocity.mul(delta);
        for (const obj of this.objects) {
            obj.moveByDelta(delta);
        }
    }

    addObject(obj: BaseObject): void {
        obj.setParentObject(this);
        this.objects.push(obj);
    }

    clone(): MultiObject {
        const clonedObjects = this.objects.map(obj => obj.clone());
        return new MultiObject(clonedObjects, this.velocity.clone(), this.inverseMass, this.restitution);
    }

    iter(): BaseObject[] {
        return this.objects.flatMap(obj => obj.iter());
    }
}