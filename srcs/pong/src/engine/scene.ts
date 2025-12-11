import { getBallCollisionTime, getWallCollisionTime, CollisionResponse, resolveBallCollision, resolveCircleLineCollision, buildQuadtree, getBoundingBox, getSweptBoundingBox, isCircleCircleOverlappingAtTime, isCircleLineOverlappingAtTime } from "./collision.js";
import { BaseObject, LineObject, CircleObject } from "./baseObjects.js";
import { EPS, FAT_EPS } from "./math.js";

interface Collision {
    time: number;
    objectA: BaseObject;
    objectB: BaseObject;
};

export class Scene {
    private objects: BaseObject[];
    private elapsedTime: number = 0;
    private timeScale: number = 1.0;

    // Disable scene debug logs in production; set true only for debugging.
    private static readonly ENABLE_SCENE_LOGS = false;

    // Enable temporary quadtree debug output to help tune PAD and quadtree behavior.
    private static readonly DEBUG_QUADTREE = true;
    // Lookahead time (in same normalized units as collision tests) to expand query boxes
    private static readonly QUADTREE_LOOKAHEAD = 2.0; // increased to be more conservative
    // Base padding for the quadtree bounds
    private static readonly QUADTREE_BASE_PAD = 10;

    constructor() {
        this.objects = [];
    }

    public setTimeScale(scale: number): void {
        this.timeScale = scale;
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

        // Build quadtree over all raw objects to quickly query nearby candidates.
        const raw = this.getRawObjects();
        if (raw.length === 0) return null;
        // Compute scene bounds
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const o of raw) {
            const box = getBoundingBox(o as any);
            if (box.minX < minX) minX = box.minX;
            if (box.minY < minY) minY = box.minY;
            if (box.maxX > maxX) maxX = box.maxX;
            if (box.maxY > maxY) maxY = box.maxY;
        }
        // Pad bounds slightly
        const PAD = Scene.QUADTREE_BASE_PAD;
        const tree = buildQuadtree(raw as any, { minX: minX - PAD, minY: minY - PAD, maxX: maxX + PAD, maxY: maxY + PAD }, Scene.QUADTREE_LOOKAHEAD);

        let totalCandidates = 0;
        let totalPairsTested = 0;
        let totalCollisionsFound = 0;

        for (const parentA of mainObjects) {
            for (const objA of parentA.iter()) {
                const queryBox = getSweptBoundingBox(objA as any, Scene.QUADTREE_LOOKAHEAD);
                const candidates = tree.queryRange(queryBox);
                if (Scene.DEBUG_QUADTREE && Scene.ENABLE_SCENE_LOGS) {
                    console.log(`Quadtree: object ${objA.constructor.name} candidates=${candidates.length}`);
                }
                totalCandidates += candidates.length;
                for (const objB of candidates) {
                    if (objA === objB) continue;
                    const parentB = this.fetchParentObject(objB) || objB;
                    if (parentA === parentB) continue;

                    // Avoid allocating temporary Vec2 for relative velocity: compute components directly
                    const rvx = parentA.velocity.x - (parentB as BaseObject).velocity.x;
                    const rvy = parentA.velocity.y - (parentB as BaseObject).velocity.y;
                    if ((rvx * rvx + rvy * rvy) < EPS) continue;

                    let tHit: number | null = null;
                    if (objA instanceof CircleObject && objB instanceof CircleObject) {
                        tHit = getBallCollisionTime(objA, objB);
                        if ((tHit === null || isNaN(tHit)) && isCircleCircleOverlappingAtTime(objA, objB, 1.0)) {
                            tHit = FAT_EPS;
                        }
                    } else if (objA instanceof CircleObject && objB instanceof LineObject) {
                        tHit = getWallCollisionTime(objA, objB);
                        if ((tHit === null || isNaN(tHit)) && isCircleLineOverlappingAtTime(objA, objB, 1.0)) {
                            tHit = FAT_EPS;
                        }
                    } else if (objA instanceof LineObject && objB instanceof CircleObject) {
                        tHit = getWallCollisionTime(objB, objA);
                        if ((tHit === null || isNaN(tHit)) && isCircleLineOverlappingAtTime(objB, objA, 1.0)) {
                            tHit = FAT_EPS;
                        }
                    }

                    totalPairsTested++;
                    if (tHit !== null && !isNaN(tHit) && (earliestCollision === null || tHit < earliestCollision.time)) {
                        earliestCollision = {
                            time: tHit,
                            objectA: objA,
                            objectB: objB,
                        };
                        totalCollisionsFound++;
                    }
                }
            }
        }

        // If quadtree-based broadphase failed to find collisions (due to tight movement
        // or padding issues), fall back to the original brute-force search to avoid
        // missing collisions.
        if (earliestCollision === null) {
            // Brute-force fallback
            if (Scene.DEBUG_QUADTREE && Scene.ENABLE_SCENE_LOGS) {
                console.log(`Quadtree summary (before brute-force): candidates=${totalCandidates} pairs_tested=${totalPairsTested} collisions_found=${totalCollisionsFound}`);
            }
            for (const parentA of mainObjects) {
                for (let j = 0; j < this.objects.length; j++) {
                    const parentB = this.objects[j]!;
                    if (parentA === parentB) continue;
                    const rvx = parentA.velocity.x - parentB.velocity.x;
                    const rvy = parentA.velocity.y - parentB.velocity.y;
                    if ((rvx * rvx + rvy * rvy) < EPS) continue;

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

                            totalPairsTested++;
                            if (tHit !== null && !isNaN(tHit) && (earliestCollision === null || tHit < earliestCollision.time)) {
                                earliestCollision = {
                                    time: tHit,
                                    objectA: objA,
                                    objectB: objB,
                                };
                                totalCollisionsFound++;
                            }
                        }
                    }
                }
            }
        }

        if (Scene.DEBUG_QUADTREE && Scene.ENABLE_SCENE_LOGS) {
            console.log(`Quadtree final summary: candidates=${totalCandidates} pairs_tested=${totalPairsTested} collisions_found=${totalCollisionsFound}`);
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
            if (Scene.ENABLE_SCENE_LOGS) console.log(`Handling collision between ${collision.objectA.constructor.name} and ${collision.objectB.constructor.name} with method ${CollisionResponse[handleMethod]}`);
            switch (handleMethod) {
                case CollisionResponse.IGNORE:
                    collision.objectA.moveByDelta(FAT_EPS);
                    collision.objectB.moveByDelta(FAT_EPS);
                    break;
                case CollisionResponse.RESET:
                    if (aTask === CollisionResponse.RESET)
                        this.objects = this.objects.filter(obj => obj !== parentA);
                    if (bTask === CollisionResponse.RESET)
                        this.objects = this.objects.filter(obj => obj !== parentB);
                    break;
                case CollisionResponse.BOUNCE:
                    collision.objectA.moveByDelta(FAT_EPS);
                    collision.objectB.moveByDelta(FAT_EPS);
                    if (collision.objectA instanceof CircleObject && collision.objectB instanceof CircleObject) {
                        resolveBallCollision(collision.objectA, collision.objectB);
                    } else if (collision.objectA instanceof CircleObject && collision.objectB instanceof LineObject) {
                        resolveCircleLineCollision(collision.objectA, collision.objectB);
                    } else if (collision.objectA instanceof LineObject && collision.objectB instanceof CircleObject) {
                        resolveCircleLineCollision(collision.objectB, collision.objectA);
                    } else {
                        console.warn(`Collision resolution not implemented for ${collision.objectA.constructor.name} and ${collision.objectB.constructor.name}`);
                    }
                    break;
            }
        }
    }

    public getElapsedTime(): number {
        return this.elapsedTime;
    }
}
