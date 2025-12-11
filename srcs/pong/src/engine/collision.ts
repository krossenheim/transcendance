import { CircleObject, LineObject } from "./baseObjects.js";
import { solveQuadratic, EPS } from "./math.js";

// --- Quadtree spatial partitioning for collision optimization ---
type BoundingBox = { minX: number, minY: number, maxX: number, maxY: number };

export function getBoundingBox(obj: CircleObject | LineObject): BoundingBox {
    if (obj instanceof CircleObject) {
        return {
            minX: obj.center.x - obj.radius,
            minY: obj.center.y - obj.radius,
            maxX: obj.center.x + obj.radius,
            maxY: obj.center.y + obj.radius,
        };
    } else if (obj instanceof LineObject) {
        return {
            minX: Math.min(obj.pointA.x, obj.pointB.x),
            minY: Math.min(obj.pointA.y, obj.pointB.y),
            maxX: Math.max(obj.pointA.x, obj.pointB.x),
            maxY: Math.max(obj.pointA.y, obj.pointB.y),
        };
    }
    // Fallback for other types
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

export function getSweptBoundingBox(obj: CircleObject | LineObject, lookahead: number): BoundingBox {
    const base = getBoundingBox(obj);
    const v = (obj as any).velocity;
    if (!v || lookahead === 0) return base;
    const dx = Math.abs(v.x * lookahead);
    const dy = Math.abs(v.y * lookahead);
    return {
        minX: base.minX - dx,
        minY: base.minY - dy,
        maxX: base.maxX + dx,
        maxY: base.maxY + dy,
    };
}

class QuadtreeNode {
    bounds: BoundingBox;
    objects: (CircleObject | LineObject)[] = [];
    children: QuadtreeNode[] = [];
    maxObjects: number;
    maxDepth: number;
    depth: number;
    lookahead: number;

    constructor(bounds: BoundingBox, depth = 0, maxObjects = 8, maxDepth = 5, lookahead = 0) {
        this.bounds = bounds;
        this.depth = depth;
        this.maxObjects = maxObjects;
        this.maxDepth = maxDepth;
        this.lookahead = lookahead;
    }

    insert(obj: CircleObject | LineObject) {
        if (this.children.length > 0) {
            const idx = this.getChildIndex(getSweptBoundingBox(obj, this.lookahead));
            if (idx !== -1 && this.children[idx]) {
                this.children[idx]!.insert(obj);
                return;
            }
        }
        this.objects.push(obj);
        if (this.objects.length > this.maxObjects && this.depth < this.maxDepth) {
            this.subdivide();
        }
    }

    getChildIndex(box: BoundingBox): number {
        for (let i = 0; i < this.children.length; ++i) {
            const c = this.children[i];
            if (!c) continue;
            if (box.minX >= c.bounds.minX && box.maxX <= c.bounds.maxX && box.minY >= c.bounds.minY && box.maxY <= c.bounds.maxY) {
                return i;
            }
        }
        return -1;
    }

    subdivide() {
        const { minX, minY, maxX, maxY } = this.bounds;
        const midX = (minX + maxX) / 2;
        const midY = (minY + maxY) / 2;
        this.children = [
            new QuadtreeNode({ minX, minY, maxX: midX, maxY: midY }, this.depth + 1, this.maxObjects, this.maxDepth, this.lookahead),
            new QuadtreeNode({ minX: midX, minY, maxX, maxY: midY }, this.depth + 1, this.maxObjects, this.maxDepth, this.lookahead),
            new QuadtreeNode({ minX, minY: midY, maxX: midX, maxY }, this.depth + 1, this.maxObjects, this.maxDepth, this.lookahead),
            new QuadtreeNode({ minX: midX, minY: midY, maxX, maxY }, this.depth + 1, this.maxObjects, this.maxDepth, this.lookahead),
        ];
        // Re-insert objects into children using swept boxes
        for (const obj of this.objects) {
            const idx = this.getChildIndex(getSweptBoundingBox(obj, this.lookahead));
            if (idx !== -1 && this.children[idx]) {
                this.children[idx]!.insert(obj);
            }
        }
        this.objects = this.objects.filter(obj => {
            const idx = this.getChildIndex(getSweptBoundingBox(obj, this.lookahead));
            return idx === -1 || !this.children[idx];
        });
    }

    queryRange(box: BoundingBox, found: (CircleObject | LineObject)[] = []): (CircleObject | LineObject)[] {
        if (!this.intersects(box, this.bounds)) return found;
        for (const obj of this.objects) {
            if (this.intersects(box, getBoundingBox(obj))) {
                found.push(obj);
            }
        }
        for (const child of this.children) {
            child.queryRange(box, found);
        }
        return found;
    }

    intersects(a: BoundingBox, b: BoundingBox): boolean {
        return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
    }
}

export function buildQuadtree(objects: (CircleObject | LineObject)[], bounds: BoundingBox, lookahead = 0): QuadtreeNode {
    const tree = new QuadtreeNode(bounds, 0, 8, 5, lookahead);
    for (const obj of objects) tree.insert(obj);
    return tree;
}

export enum CollisionResponse {
    BOUNCE = 0,
    IGNORE = 1,
    RESET = 2,
};

export function getWallCollisionTime(
    ball: CircleObject,
    wall: LineObject,
) {
    // relative velocity components (avoid temporary Vec2 allocations)
    const rvx = ball.velocity.x - wall.velocity.x;
    const rvy = ball.velocity.y - wall.velocity.y;

    // relative start position of ball center to wall.pointA
    const sx = ball.center.x - wall.pointA.x;
    const sy = ball.center.y - wall.pointA.y;

    // wall vector
    const wx = wall.pointB.x - wall.pointA.x;
    const wy = wall.pointB.y - wall.pointA.y;
    const wallLenSq = wx * wx + wy * wy;
    if (wallLenSq <= EPS) return null;

    const wallLen = Math.sqrt(wallLenSq);

    // unit normal to wall (perp of wall vector)
    let nx = -wy / wallLen;
    let ny = wx / wallLen;

    // ensure normal faces opposite to relative velocity
    const relDot = rvx * nx + rvy * ny;
    if (relDot >= -EPS) {
        nx = -nx;
        ny = -ny;
    }

    const vecAlongNormal = rvx * nx + rvy * ny;
    if (Math.abs(vecAlongNormal) < EPS) return null;

    const distanceToLine = sx * nx + sy * ny;
    const tHit = (ball.radius - distanceToLine) / vecAlongNormal;
    if (tHit < 0) return null;

    const bx = sx + rvx * tHit;
    const by = sy + rvy * tHit;

    const shadowLengthSq = bx * wx + by * wy;
    const segmentT = shadowLengthSq / wallLenSq;
    if (segmentT < 0 || segmentT > 1) return null;

    return tHit;
}

export function getBallCollisionTime(
    ballA: CircleObject,
    ballB: CircleObject,
): number | null {
    const sx = ballB.center.x - ballA.center.x;
    const sy = ballB.center.y - ballA.center.y;
    const rvx = ballB.velocity.x - ballA.velocity.x;
    const rvy = ballB.velocity.y - ballA.velocity.y;
    const combinedRadius = ballA.radius + ballB.radius;

    const a = rvx * rvx + rvy * rvy;
    const b = 2 * (sx * rvx + sy * rvy);
    const c = sx * sx + sy * sy - combinedRadius * combinedRadius;

    const roots = solveQuadratic(a, b, c);
    if (roots.length > 0) {
        const t = roots[0]!

        if (t >= -EPS && t <= 1 + EPS) {
            return t;
        }
    }

    return null;
}

export function resolveBallCollision(
    ballA: CircleObject,
    ballB: CircleObject,
): void {
    // normal from A to B
    const dx = ballB.center.x - ballA.center.x;
    const dy = ballB.center.y - ballA.center.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= EPS) return;
    const dist = Math.sqrt(distSq);
    const nx = dx / dist;
    const ny = dy / dist;

    const rvx = ballB.velocity.x - ballA.velocity.x;
    const rvy = ballB.velocity.y - ballA.velocity.y;
    const velocityAlongNormal = rvx * nx + rvy * ny;

    if (velocityAlongNormal > 0) return;

    const j = -(1 + Math.min(ballA.restitution, ballB.restitution)) * velocityAlongNormal / (ballA.inverseMass + ballB.inverseMass);

    const jnx = nx * j;
    const jny = ny * j;

    const va = ballA.velocity;
    const vb = ballB.velocity;
    va.x = va.x - jnx * ballA.inverseMass;
    va.y = va.y - jny * ballA.inverseMass;
    vb.x = vb.x + jnx * ballB.inverseMass;
    vb.y = vb.y + jny * ballB.inverseMass;
}

export function resolveCircleLineCollision(
    ball: CircleObject,
    wall: LineObject,
): void {
    const wx = wall.pointB.x - wall.pointA.x;
    const wy = wall.pointB.y - wall.pointA.y;
    const wallLenSq = wx * wx + wy * wy;
    if (wallLenSq <= EPS) return;
    const wallLen = Math.sqrt(wallLenSq);

    const rvx = ball.velocity.x - wall.velocity.x;
    const rvy = ball.velocity.y - wall.velocity.y;

    let nx = -wy / wallLen;
    let ny = wx / wallLen;
    if (rvx * nx + rvy * ny > 0) {
        nx = -nx;
        ny = -ny;
    }

    const velocityAlongNormal = rvx * nx + rvy * ny;
    const j = -(1 + Math.min(ball.restitution, wall.restitution)) * velocityAlongNormal / (ball.inverseMass + wall.inverseMass);

    const jnx = nx * j;
    const jny = ny * j;

    const vb = ball.velocity;
    vb.x = vb.x + jnx * ball.inverseMass;
    vb.y = vb.y + jny * ball.inverseMass;

    const vw = wall.velocity;
    vw.x = vw.x - jnx * wall.inverseMass;
    vw.y = vw.y - jny * wall.inverseMass;
}

// Fallback overlap checks at a given normalized time t in [0,1].
export function isCircleCircleOverlappingAtTime(a: CircleObject, b: CircleObject, t: number): boolean {
    const ax = a.center.x + a.velocity.x * t;
    const ay = a.center.y + a.velocity.y * t;
    const bx = b.center.x + b.velocity.x * t;
    const by = b.center.y + b.velocity.y * t;
    const dx = bx - ax;
    const dy = by - ay;
    const distSq = dx * dx + dy * dy;
    const r = a.radius + b.radius;
    return distSq <= r * r + EPS;
}

export function isCircleLineOverlappingAtTime(ball: CircleObject, wall: LineObject, t: number): boolean {
    const cx = ball.center.x + ball.velocity.x * t;
    const cy = ball.center.y + ball.velocity.y * t;

    const ax = wall.pointA.x + wall.velocity.x * t;
    const ay = wall.pointA.y + wall.velocity.y * t;
    const bx = wall.pointB.x + wall.velocity.x * t;
    const by = wall.pointB.y + wall.velocity.y * t;

    const wx = bx - ax;
    const wy = by - ay;
    const lenSq = wx * wx + wy * wy;
    if (lenSq <= EPS) return false;

    // Project center onto wall segment
    const tProj = ((cx - ax) * wx + (cy - ay) * wy) / lenSq;
    const clamped = Math.max(0, Math.min(1, tProj));
    const closestX = ax + wx * clamped;
    const closestY = ay + wy * clamped;
    const dx = cx - closestX;
    const dy = cy - closestY;
    return (dx * dx + dy * dy) <= (ball.radius * ball.radius + EPS);
}
