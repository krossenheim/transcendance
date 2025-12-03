export const EPS = 1e-9;
export const FAT_EPS = 1e-5;

export function isNearly(x: number, n: number): boolean {
    return Math.abs(x - n) < EPS;
}

export class Vec2 {
    constructor(public x: number, public y: number) { }

    add(v: Vec2): Vec2 {
        return new Vec2(this.x + v.x, this.y + v.y);
    }

    sub(v: Vec2): Vec2 {
        return new Vec2(this.x - v.x, this.y - v.y);
    }

    mul(s: number): Vec2 {
        return new Vec2(this.x * s, this.y * s);
    }

    div(s: number): Vec2 {
        return new Vec2(this.x / s, this.y / s);
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

    normalize(): Vec2 {
        const length = this.len();
        if (length !== 0) {
            return this.div(length);
        }
        return new Vec2(0, 0);
    }

    angle(): number {
        return Math.atan2(this.y, this.x);
    }

    rotate(angle: number): Vec2 {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const x = this.x * cos - this.y * sin;
        const y = this.x * sin + this.y * cos;
        return new Vec2(x, y);
    }

    perp(): Vec2 {
        return new Vec2(-this.y, this.x);
    }

    clone(): Vec2 {
        return new Vec2(this.x, this.y);
    }
}

export function solveQuadratic(a: number, b: number, c: number): number[] {
    if (isNearly(a, 0)) {
        if (isNearly(b, 0))
            return [];
        return [-c / b];
    }

    const disc = b * b - 4 * a * c;
    if (disc < -EPS) return [];
    if (disc < 0) return [-b / (2 * a)];

    const sqrtDisc = Math.sqrt(disc);
    return [(-b - sqrtDisc) / (2 * a), (-b + sqrtDisc) / (2 * a)];
}
