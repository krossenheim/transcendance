export const EPS = 1e-9;
// FAT_EPS: Small time delta to advance after collision resolution
// This prevents objects from immediately re-colliding on the same frame
// Must be small enough to not cause visible jumps (velocity * FAT_EPS should be tiny)
export const FAT_EPS = 1e-3;  // 1ms worth of movement

export function isNearly(x: number, n: number): boolean {
    return Math.abs(x - n) < EPS;
}

export class Vec2 {
    constructor(public x: number, public y: number) { }

    set(x: number, y: number): this {
        this.x = x;
        this.y = y;
        return this;
    }

    copy(v: Vec2): this {
        this.x = v.x;
        this.y = v.y;
        return this;
    }

    clone(): Vec2 {
        return new Vec2(this.x, this.y);
    }

    add(v: Vec2): this {
        this.x += v.x;
        this.y += v.y;
        return this;
    }

    sub(v: Vec2): this {
        this.x -= v.x;
        this.y -= v.y;
        return this;
    }

    mul(s: number): this {
        this.x *= s;
        this.y *= s;
        return this;
    }

    div(s: number): this {
        const inv = 1 / s;
        this.x *= inv;
        this.y *= inv;
        return this;
    }

    addScaled(v: Vec2, s: number): this {
        this.x += v.x * s;
        this.y += v.y * s;
        return this;
    }

    dot(v: Vec2): number {
        return this.x * v.x + this.y * v.y;
    }

    len(): number {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    lenSq(): number {
        return this.dot(this);
    }

    angle(): number {
        return Math.atan2(this.y, this.x);
    }

    distanceTo(v: Vec2): number {
        const dx = this.x - v.x;
        const dy = this.y - v.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    normalize(): this {
        const length = this.len();
        if (length > EPS) {
            this.div(length);
        } else {
            this.x = 0;
            this.y = 0;
        }
        return this;
    }

    rotate(angle: number): Vec2 {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const currentX = this.x;
        const currentY = this.y;

        this.x = currentX * cos - currentY * sin;
        this.y = currentX * sin + currentY * cos;
        return this;
    }

    perp(): Vec2 {
        const tempX = this.x;
        this.x = -this.y;
        this.y = tempX;
        return this;
    }
}

export const QUAD_BUFFER = new Float64Array(2);

export function solveQuadratic(a: number, b: number, c: number, out: Float64Array): number {
    if (isNearly(a, 0)) {
        if (isNearly(b, 0))
            return 0;
        out[0] = -c / b;
        return 1;
    }

    const disc = b * b - 4 * a * c;
    if (disc < -EPS) return 0;
    if (disc < 0) {
        out[0] = -b / (2 * a);
        return 1;
    }

    const sqrtDisc = Math.sqrt(disc);
    out[0] = (-b - sqrtDisc) / (2 * a);
    out[1] = (-b + sqrtDisc) / (2 * a);
    return 2;
}
