import { getBallCollisionTime, getWallCollisionTime, CollisionResponse, resolveBallCollision, resolveCircleLineCollision } from "./collision.js";
import { BaseObject, LineObject, CircleObject } from "./baseObjects.js";
import { EPS, FAT_EPS, Vec2 } from "./math.js";

interface Collision {
    time: number;
    objectA: BaseObject;
    objectB: BaseObject;
};

const scratchRelativeVelocity = new Vec2(0, 0);

// Maximum distance an object should move per nudge (prevents high-speed tunneling)
const MAX_NUDGE_DISTANCE = 0.5;

// Target ball speed (will be set by game when constructing scene)
let targetBallSpeed: number = 450;

export class Scene {
    private objects: BaseObject[];
    private elapsedTime: number = 0;
    private timeScale: number = 1.0;

    constructor(ballSpeed: number = 450) {
        this.objects = [];
        targetBallSpeed = ballSpeed;
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
        for (const childObj of obj.iter())
            this.objects = this.objects.filter(o => o !== childObj);
        this.objects = this.objects.filter(o => o !== obj);
    }

    public getObjects(): BaseObject[] {
        return this.objects;
    }

    public getRawObjects(): BaseObject[] {
        let output = [];
        for (const obj of this.objects) {
            for (const subObj of obj.iter()) {
                output.push(subObj);
            }
        }
        return output;
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
                
                // Skip if objects have no relative velocity
                const relVelSq = scratchRelativeVelocity.copy(parentA.velocity).sub(parentB.velocity).lenSq();
                if (relVelSq < EPS) continue;

                for (const objA of parentA.iter()) {
                    for (const objB of parentB.iter()) {
                        if (objA === objB) continue;

                        let tHit: number | null = null;

                        if (objA instanceof CircleObject && objB instanceof CircleObject) {
                            tHit = getBallCollisionTime(objA, objB);
                        } else if (objA instanceof CircleObject && objB instanceof LineObject) {
                            tHit = getWallCollisionTime(objA, objB);
                        } else if (objA instanceof LineObject && objB instanceof CircleObject) {
                            tHit = getWallCollisionTime(objB, objA);
                        }

                        if (tHit !== null && !isNaN(tHit) && (earliestCollision === null || tHit < earliestCollision.time)) {
                            earliestCollision = {
                                time: tHit,
                                objectA: objA,
                                objectB: objB,
                            };
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

    private fetchParentObject(obj: BaseObject): BaseObject | null {
        for (const sceneObj of this.objects) {
            if (sceneObj === obj) continue;
            if (sceneObj.isPartOfObject(obj)) {
                return this.fetchParentObject(sceneObj) || sceneObj;
            }
        }
        return null;
    }

    public playSimulation(deltaTime: number, mainObjects?: BaseObject[]) {
        let timeRemaining = deltaTime * this.timeScale;
        let shouldContinue = true;
        let timeout = 1000;

        while (timeRemaining > EPS && shouldContinue && timeout-- > 0) {
            const collision = this.getNextCollisionBetweenObjects(mainObjects || this.objects);

            if (collision === null || collision.time - EPS > timeRemaining) {
                this.moveSceneObjects(timeRemaining);
                break;
            }

            const earliestHit = collision.time;
            this.moveSceneObjects(earliestHit);
            timeRemaining -= earliestHit;

            const parentA = this.fetchParentObject(collision.objectA) || collision.objectA;
            const parentB = this.fetchParentObject(collision.objectB) || collision.objectB;
            const aTask = parentA.onCollision(parentB, this.elapsedTime);
            const bTask = parentB.onCollision(parentA, this.elapsedTime);

            const handleMethod = Math.max(aTask, bTask);
            switch (handleMethod) {
                case CollisionResponse.IGNORE:
                    // Nudge AFTER handling to prevent objects from tunneling
                    this.safeNudge(collision.objectA);
                    this.safeNudge(collision.objectB);
                    break;
                case CollisionResponse.RESET:
                    // Nudge the surviving object to prevent getting stuck at collision point
                    if (aTask === CollisionResponse.RESET) {
                        this.objects = this.objects.filter(obj => obj !== parentA);
                    }
                    if (bTask === CollisionResponse.RESET) {
                        this.objects = this.objects.filter(obj => obj !== parentB);
                    }
                    // Nudge surviving objects after removal
                    if (aTask !== CollisionResponse.RESET) this.safeNudge(collision.objectA);
                    if (bTask !== CollisionResponse.RESET) this.safeNudge(collision.objectB);
                    break;
                case CollisionResponse.BOUNCE:
                    // Resolve collision FIRST, then nudge to prevent tunneling
                    if (collision.objectA instanceof CircleObject && collision.objectB instanceof CircleObject) {
                        resolveBallCollision(collision.objectA, collision.objectB);
                        // Normalize both balls to target speed after collision
                        this.normalizeBallSpeed(collision.objectA);
                        this.normalizeBallSpeed(collision.objectB);
                    } else if (collision.objectA instanceof CircleObject && collision.objectB instanceof LineObject) {
                        resolveCircleLineCollision(collision.objectA, collision.objectB);
                        // Normalize ball speed after bouncing off wall/paddle
                        this.normalizeBallSpeed(collision.objectA);
                    } else if (collision.objectA instanceof LineObject && collision.objectB instanceof CircleObject) {
                        resolveCircleLineCollision(collision.objectB, collision.objectA);
                        // Normalize ball speed after bouncing off wall/paddle
                        this.normalizeBallSpeed(collision.objectB);
                    } else {
                        console.warn(`Collision resolution not implemented for ${collision.objectA.constructor.name} and ${collision.objectB.constructor.name}`);
                    }
                    // Nudge AFTER resolving collision to prevent re-collision on same frame
                    this.safeNudge(collision.objectA);
                    this.safeNudge(collision.objectB);
                    break;
            }
        }
        
        // BULLETPROOF FIX: After all collisions are resolved, do a final penetration check
        // This catches any balls that somehow ended up inside walls/paddles
        this.fixAllPenetrations(mainObjects || this.objects);
    }

    /**
     * BULLETPROOF penetration fix: Check all circles against all lines and push them out.
     * This runs after every simulation step as a safety net.
     */
    private fixAllPenetrations(mainObjects: BaseObject[]): void {
        // Collect all circles (balls) from main objects
        const circles: CircleObject[] = [];
        for (const obj of mainObjects) {
            for (const subObj of obj.iter()) {
                if (subObj instanceof CircleObject) {
                    circles.push(subObj);
                }
            }
        }
        
        // Collect all lines (walls, paddle edges) from all scene objects
        const lines: LineObject[] = [];
        for (const obj of this.objects) {
            for (const subObj of obj.iter()) {
                if (subObj instanceof LineObject) {
                    lines.push(subObj);
                }
            }
        }
        
        // Check each circle against each line and fix penetrations
        for (const circle of circles) {
            for (const line of lines) {
                this.fixCircleLinePenetration(circle, line);
            }
        }
    }

    /**
     * If a circle is penetrating a line segment, push it out.
     * Does NOT reflect velocity - lets normal collision system handle that.
     * This ensures player walls still trigger reset instead of bounce.
     */
    private fixCircleLinePenetration(circle: CircleObject, line: LineObject): void {
        // Vector from line start to end
        const lineVec = line.pointB.clone().sub(line.pointA);
        const lineLenSq = lineVec.lenSq();
        
        if (lineLenSq < EPS) return; // Skip zero-length lines
        
        // Vector from line start to circle center
        const toCircle = circle.center.clone().sub(line.pointA);
        
        // Project circle center onto line, clamped to segment
        const t = Math.max(0, Math.min(1, toCircle.dot(lineVec) / lineLenSq));
        
        // Closest point on line segment to circle center
        const closest = line.pointA.clone().add(lineVec.clone().mul(t));
        
        // Vector from closest point to circle center
        const normal = circle.center.clone().sub(closest);
        const dist = normal.len();
        
        // Check if penetrating (distance < radius)
        if (dist < circle.radius) {
            if (dist < EPS) {
                // Circle center is exactly on the line - use perpendicular as normal
                normal.set(-lineVec.y, lineVec.x).normalize();
            } else {
                // Normalize the normal
                normal.div(dist);
            }
            
            // Push circle out so it's exactly at radius distance + safety margin
            // Do NOT reflect velocity - let normal collision system handle bounce/reset
            const penetration = circle.radius - dist;
            circle.center.add(normal.mul(penetration + 0.5));
        }
    }

    /**
     * Safely nudge an object forward by FAT_EPS, but limit the actual distance
     * traveled to prevent high-speed objects from tunneling through walls.
     */
    private safeNudge(obj: BaseObject): void {
        const speed = obj.velocity.len();
        if (speed < EPS) return;
        
        // Calculate how far the object would move in FAT_EPS time
        const nudgeDistance = speed * FAT_EPS;
        
        // If that distance is too large, reduce the time step proportionally
        if (nudgeDistance > MAX_NUDGE_DISTANCE) {
            const safeDeltaTime = MAX_NUDGE_DISTANCE / speed;
            obj.moveByDelta(safeDeltaTime);
        } else {
            obj.moveByDelta(FAT_EPS);
        }
    }

    /**
     * Normalize a circle object's velocity to the target ball speed.
     * This ensures constant ball speed regardless of collision dynamics.
     */
    private normalizeBallSpeed(obj: CircleObject): void {
        const speed = obj.velocity.len();
        if (speed > EPS) {
            // Scale velocity to maintain constant speed
            const scale = targetBallSpeed / speed;
            obj.velocity = obj.velocity.mul(scale);
        }
    }

    public getElapsedTime(): number {
        return this.elapsedTime;
    }
}
