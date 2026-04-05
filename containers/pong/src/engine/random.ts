export class SeededRandom {
    private state: number;
    private initialSeed: number;

    constructor(seed: number) {
        this.initialSeed = seed >>> 0;
        this.state = this.initialSeed;
    }

    public next(): number {
        let t = (this.state += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    public nextFloat(min: number, max: number): number {
        return this.next() * (max - min) + min;
    }

    public nextAngle(): number {
        return this.next() * 2 * Math.PI;
    }

    public getSeed(): number {
        return this.initialSeed;
    }

    public static withRandomSeed(): SeededRandom {
        return new SeededRandom((Math.random() * 0xffffffff) >>> 0);
    }

}

