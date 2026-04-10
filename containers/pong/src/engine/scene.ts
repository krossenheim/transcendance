import { getBallCollisionTime, getWallCollisionTime, CollisionResponse, resolveBallCollision, resolveCircleLineCollision } from "./collision.js";
import { BaseObject, LineObject, CircleObject } from "./baseObjects.js";
import { EPS, FAT_EPS, Vec2 } from "./math.js";

interface Collision {
    time: number;
    objectA: BaseObject;
    objectB: BaseObject;
};

const scratchRelativeVelocity = new Vec2(0, 0);
const scratchRelativePosition = new Vec2(0, 0);

const MAX_NUDGE_DISTANCE = 0.5;

export class Scene {
    private objects: BaseObject[];
    private elapsedTime: number = 0;
    private timeScale: number = 1.0;
    private arenaCenterX: number;
    private arenaCenterY: number;
    private targetBallSpeed: number;
    private _collisionResult: Collision = { time: 0, objectA: null as any, objectB: null as any };

    constructor(ballSpeed: number = 450, arenaCenterX: number = 500, arenaCenterY: number = 500) {
        this.objects = [];
        this.arenaCenterX = arenaCenterX;
        this.arenaCenterY = arenaCenterY;
        this.targetBallSpeed = ballSpeed;
    }

    public setTimeScale(scale: number): void {
        this.timeScale = scale;
    }

    public getTimeScale(): number {
        return this.timeScale;
    }

    public addObject(obj: BaseObject): void {
        this.objects.push(obj);
    }

    public removeObject(obj: BaseObject): void {
        const toRemove = new Set<BaseObject>();
        toRemove.add(obj);
        for (const childObj of obj.iter())
            toRemove.add(childObj);
        this.objects = this.objects.filter(o => !toRemove.has(o));
    }

    private moveSceneObjects(deltaTime: number): void {
        for (const obj of this.objects) {
            obj.moveByDelta(deltaTime);
        }
        this.elapsedTime += (deltaTime / this.timeScale);
    }

    private getNextCollisionBetweenObjects(mainObjects: BaseObject[]): Collision | null {
        let earliestCollision: Collision | null = null;

        for (const parentA of mainObjects) {
            for (let j = 0; j < this.objects.length; j++) {
                const parentB = this.objects[j]!;
                if (parentA === parentB) continue;

                const relVelSq = scratchRelativeVelocity.copy(parentA.velocity).sub(parentB.velocity).lenSq();

                for (const objA of parentA.iter()) {
                    for (const objB of parentB.iter()) {
                        if (objA === objB) continue;

                        let tHit: number | null = null;

                        if (objA instanceof CircleObject && objB instanceof CircleObject) {
                            if (relVelSq < EPS) {
                                // Even with near-zero relative velocity, check if balls overlap
                                const combinedRadius = objA.radius + objB.radius;
                                const distSq = scratchRelativePosition.copy(objB.center).sub(objA.center).lenSq();
                                if (distSq < combinedRadius * combinedRadius - EPS) {
                                    tHit = 0;
                                }
                            } else {
                                tHit = getBallCollisionTime(objA, objB);
                            }
                        } else if (relVelSq >= EPS) {
                            if (objA instanceof CircleObject && objB instanceof LineObject) {
                                tHit = getWallCollisionTime(objA, objB);
                            } else if (objA instanceof LineObject && objB instanceof CircleObject) {
                                tHit = getWallCollisionTime(objB, objA);
                            }
                        }

                        if (tHit !== null && !isNaN(tHit) && (earliestCollision === null || tHit < earliestCollision.time)) {
                            this._collisionResult.time = tHit;
                            this._collisionResult.objectA = objA;
                            this._collisionResult.objectB = objB;
                            earliestCollision = this._collisionResult;
                        }

                        if (tHit !== null && tHit < 0) {
                            console.warn(`Negative collision time detected between ${objA.constructor.name} and ${objB.constructor.name}: tHit=${tHit}`);
                        }
                    }
                }
            }
        }

        return earliestCollision;
    }

    public playSimulation(deltaTime: number, mainObjects?: BaseObject[]) {
        let timeRemaining = deltaTime * this.timeScale;
        let shouldContinue = true;
        let timeout = 1000;

        let zeroTimeCollisionCount = 0;
        const MAX_ZERO_TIME_COLLISIONS = 8;

        while (timeRemaining > EPS && shouldContinue && timeout-- > 0) {
            const collision = this.getNextCollisionBetweenObjects(mainObjects || this.objects);

            if (collision === null || collision.time - EPS > timeRemaining) {
                this.moveSceneObjects(timeRemaining);
                break;
            }

            const earliestHit = collision.time;

            if (earliestHit < FAT_EPS) {
                zeroTimeCollisionCount++;
            } else {
                zeroTimeCollisionCount = 0;
            }

            if (zeroTimeCollisionCount >= MAX_ZERO_TIME_COLLISIONS) {
                let stuckBall: CircleObject | null = null;
                if (collision.objectA instanceof CircleObject && collision.objectA.inverseMass > 0) {
                    stuckBall = collision.objectA;
                } else if (collision.objectB instanceof CircleObject && collision.objectB.inverseMass > 0) {
                    stuckBall = collision.objectB;
                }
                if (stuckBall) {
                    console.warn(`[Scene] Ball stuck in collision loop - teleporting to center from (${stuckBall.center.x.toFixed(1)}, ${stuckBall.center.y.toFixed(1)})`);
                    stuckBall.center.x = this.arenaCenterX;
                    stuckBall.center.y = this.arenaCenterY;
                    const speed = stuckBall.velocity.len();
                    if (speed > EPS) {
                        const randomAngle = Math.random() * Math.PI * 2;
                        stuckBall.velocity.x = Math.cos(randomAngle) * speed;
                        stuckBall.velocity.y = Math.sin(randomAngle) * speed;
                    }
                }
                break;
            }

            this.moveSceneObjects(earliestHit);
            timeRemaining -= earliestHit;

            const parentA = collision.objectA.getParentObject();
            const parentB = collision.objectB.getParentObject();
            const aTask = parentA.onCollision(parentB, this.elapsedTime);
            const bTask = parentB.onCollision(parentA, this.elapsedTime);

            const handleMethod = Math.max(aTask, bTask);
            switch (handleMethod) {
                case CollisionResponse.IGNORE:
                    this.safeNudge(collision.objectA);
                    this.safeNudge(collision.objectB);
                    break;
                case CollisionResponse.RESET:
                    if (aTask === CollisionResponse.RESET) {
                        const idxA = this.objects.indexOf(parentA);
                        if (idxA !== -1) this.objects.splice(idxA, 1);
                    }
                    if (bTask === CollisionResponse.RESET) {
                        const idxB = this.objects.indexOf(parentB);
                        if (idxB !== -1) this.objects.splice(idxB, 1);
                    }
                    if (aTask !== CollisionResponse.RESET) this.safeNudge(collision.objectA);
                    if (bTask !== CollisionResponse.RESET) this.safeNudge(collision.objectB);
                    break;
                case CollisionResponse.BOUNCE:
                    if (collision.objectA instanceof CircleObject && collision.objectB instanceof CircleObject) {
                        resolveBallCollision(collision.objectA, collision.objectB);
                        this.normalizeBallSpeed(collision.objectA);
                        this.normalizeBallSpeed(collision.objectB);
                    } else if (collision.objectA instanceof CircleObject && collision.objectB instanceof LineObject) {
                        resolveCircleLineCollision(collision.objectA, collision.objectB);
                        this.normalizeBallSpeed(collision.objectA);
                    } else if (collision.objectA instanceof LineObject && collision.objectB instanceof CircleObject) {
                        resolveCircleLineCollision(collision.objectB, collision.objectA);
                        this.normalizeBallSpeed(collision.objectB);
                    } else {
                        console.warn(`Collision resolution not implemented for ${collision.objectA.constructor.name} and ${collision.objectB.constructor.name}`);
                    }
                    this.safeNudge(collision.objectA);
                    this.safeNudge(collision.objectB);
                    break;
            }
        }
    }

    private safeNudge(obj: BaseObject): void {
        const speed = obj.velocity.len();
        if (speed < EPS) return;

        const nudgeDistance = speed * FAT_EPS;

        if (nudgeDistance > MAX_NUDGE_DISTANCE) {
            const safeDeltaTime = MAX_NUDGE_DISTANCE / speed;
            obj.moveByDelta(safeDeltaTime);
        } else {
            obj.moveByDelta(FAT_EPS);
        }
    }

    private normalizeBallSpeed(obj: CircleObject): void {
        const speed = obj.velocity.len();
        if (speed > EPS) {
            const scale = this.targetBallSpeed / speed;
            obj.velocity = obj.velocity.mul(scale);
        }
    }

}

