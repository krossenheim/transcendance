/**
 * Deterministic seeded PRNG using mulberry32 algorithm.
 * This ensures identical random sequences given the same seed,
 * which is critical for deterministic game simulation and rollback netcode.
 */
export class SeededRandom {
    private state: number;
    private initialSeed: number;

    constructor(seed: number) {
        this.initialSeed = seed >>> 0; // Convert to unsigned 32-bit
        this.state = this.initialSeed;
    }

    /**
     * Get the next random number in [0, 1)
     * Uses mulberry32 algorithm - fast and has good statistical properties
     */
    public next(): number {
        let t = (this.state += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /**
     * Get a random integer in [min, max] (inclusive)
     */
    public nextInt(min: number, max: number): number {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }

    /**
     * Get a random float in [min, max)
     */
    public nextFloat(min: number, max: number): number {
        return this.next() * (max - min) + min;
    }

    /**
     * Get a random angle in [0, 2π)
     */
    public nextAngle(): number {
        return this.next() * 2 * Math.PI;
    }

    /**
     * Reset the RNG to initial state (for game replay/rollback)
     */
    public reset(): void {
        this.state = this.initialSeed;
    }

    /**
     * Get current internal state (for serialization)
     */
    public getState(): number {
        return this.state;
    }

    /**
     * Set internal state (for deserialization/rollback)
     */
    public setState(state: number): void {
        this.state = state >>> 0;
    }

    /**
     * Get the initial seed
     */
    public getSeed(): number {
        return this.initialSeed;
    }

    /**
     * Create a new SeededRandom with a random seed (for game initialization)
     */
    public static withRandomSeed(): SeededRandom {
        return new SeededRandom((Math.random() * 0xffffffff) >>> 0);
    }

    /**
     * Create a new SeededRandom from timestamp (reproducible if you know the time)
     */
    public static fromTimestamp(): SeededRandom {
        return new SeededRandom(Date.now() >>> 0);
    }
}
