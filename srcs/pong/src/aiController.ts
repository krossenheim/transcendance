/**
 * AI Controller for Pong
 *
 * Simulates ball trajectory with wall bounces to predict where
 * the ball will reach the paddle's orbit, then moves there.
 * Uses a committed target with hysteresis to prevent jitter.
 *
 * Difficulty affects reaction speed, prediction accuracy, and dead-zone size.
 */

export enum AIDifficulty {
  EASY = 1,
  MEDIUM = 2,
  HARD = 3,
  NIGHTMARE = 4,
}

interface DifficultyParams {
  refreshIntervalMs: number;    // How often the AI recalculates (lower = faster reactions)
  maxBounces: number;           // How many wall bounces to simulate (higher = better prediction)
  commitThreshold: number;      // Angular change needed to re-commit target (lower = more responsive)
  commitLockoutMs: number;      // Minimum ms between target changes (lower = faster re-targeting)
  deadZoneMultiplier: number;   // Multiplier for dead zone (lower = more precise positioning)
  minDeadZonePx: number;        // Minimum dead zone in pixels
  predictionError: number;      // Random angle offset added to prediction (radians, 0 = perfect)
  sectorMatchWidth: number;     // Multiplier for sector matching (lower = fewer false positive intercepts)
  ballGracePeriodMs: number;    // How long to hold position after losing ball tracking
  speedMultiplier: number;      // Paddle speed multiplier for AI (1.0 = normal)
}

const DIFFICULTY_PARAMS: Record<AIDifficulty, DifficultyParams> = {
  [AIDifficulty.EASY]: {
    refreshIntervalMs: 1000,
    maxBounces: 10,
    commitThreshold: 0.08,
    commitLockoutMs: 100,
    deadZoneMultiplier: 0.08,
    minDeadZonePx: 15,
    predictionError: 0.18,
    sectorMatchWidth: 1.8,
    ballGracePeriodMs: 3000,
    speedMultiplier: 1.0,
  },
  [AIDifficulty.MEDIUM]: {
    refreshIntervalMs: 1000,
    maxBounces: 15,
    commitThreshold: 0.06,
    commitLockoutMs: 50,
    deadZoneMultiplier: 0.06,
    minDeadZonePx: 10,
    predictionError: 0.08,
    sectorMatchWidth: 1.5,
    ballGracePeriodMs: 3000,
    speedMultiplier: 1.0,
  },
  [AIDifficulty.HARD]: {
    refreshIntervalMs: 1000,
    maxBounces: 25,
    commitThreshold: 0.03,
    commitLockoutMs: 30,
    deadZoneMultiplier: 0.04,
    minDeadZonePx: 5,
    predictionError: 0,
    sectorMatchWidth: 1.2,
    ballGracePeriodMs: 3000,
    speedMultiplier: 1.0,
  },
  [AIDifficulty.NIGHTMARE]: {
    refreshIntervalMs: 1000,
    maxBounces: 30,
    commitThreshold: 0.02,
    commitLockoutMs: 15,
    deadZoneMultiplier: 0.02,
    minDeadZonePx: 3,
    predictionError: 0,
    sectorMatchWidth: 1.1,
    ballGracePeriodMs: 3000,
    speedMultiplier: 5.0,
  },
};

// --- Helpers ---

function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Shortest signed angular difference (target − current), in [−π, π]. */
function angDiff(target: number, current: number): number {
  return normalizeAngle(target - current);
}

interface WallData {
  ax: number; ay: number;
  bx: number; by: number;
  playerId: number | null;
}

// ─────────────────────────────────────────────────────────

export class AIController {
  private playerId: number;
  private params: DifficultyParams;
  private lastRefreshTime: number = 0;
  private currentKeys: string[] = [];


  // Paddle geometry (fixed after init)
  private paddleOrbitRadius: number = 0;
  private sectorCenter: number = 0;       // fixed "home" angle of this paddle
  private sectorHalfWidth: number = Math.PI;
  private maxPaddleAngle: number = Math.PI; // maximum angular offset from sector center
  private isTopHalf: boolean = false;     // fixed from paddle direction, determines key mapping

  // Current paddle angle (updated each frame from game state)
  private paddleAngle: number = 0;
  private paddleSpeed: number = 0;   // current paddle speed in px/s

  // Estimated paddle angle — tracks position between refreshes to prevent overshoot
  private estimatedPaddleAngle: number = 0;
  private lastUpdateTime: number = 0;
  private reachedTarget: boolean = false; // Locks paddle once it reaches target (prevents jitter)

  // Committed target angle — only updated when raw prediction differs significantly
  private committedTargetAngle: number = 0;
  private hasCommittedTarget: boolean = false;
  private lastCommitTime: number = 0;        // timestamp of last target commit
  private lastBallDetectedTime: number = 0;  // when we last saw a ball heading our way
  private usingFallback: boolean = false;     // true when trajectory prediction failed and fallback is active

  // Arena walls (refreshed from game state to handle eliminations)
  private walls: WallData[] = [];
  private myWallIndices: number[] = [];  // indices of walls belonging to this player
  private initialized: boolean = false;

  constructor(playerId: number, difficulty: AIDifficulty = AIDifficulty.MEDIUM) {
    this.playerId = playerId;
    this.params = DIFFICULTY_PARAMS[difficulty];
  }

  public getSpeedMultiplier(): number {
    return this.params.speedMultiplier;
  }

  public getKeys(): string[] {
    return this.currentKeys;
  }

  public shouldRefresh(currentTime: number): boolean {
    return currentTime - this.lastRefreshTime >= this.params.refreshIntervalMs;
  }

  // ── Main update ──────────────────────────────────────

  public refreshGameState(gameState: any, timestamp: number = Date.now()): void {
    const now = timestamp;
    this.lastRefreshTime = now;
    if (!gameState) return;

    const cx = 500, cy = 500;
    const paddles = gameState.paddles || [];
    const balls   = gameState.balls   || [];

    // Find our paddle in the game state
    let paddleX = 0, paddleY = 0;
    let paddleDirAngle = 0;          // paddleDirection.angle() from JSON[2]
    let boardPaddleSpeed = 0;        // paddle speed in px/s from JSON[8]
    for (const p of paddles) {
      const ownerId = Array.isArray(p) ? p[7] : (p?.owner_id ?? p?.ownerId ?? p?.player_id);
      if (ownerId === this.playerId) {
        paddleX        = Array.isArray(p) ? p[0] : p.x;
        paddleY        = Array.isArray(p) ? p[1] : p.y;
        paddleDirAngle = Array.isArray(p) ? p[2] : 0;
        boardPaddleSpeed = Array.isArray(p) ? (p[8] || 0) : 0;
        break;
      }
    }

    // One-time initialisation of stable paddle geometry
    if (!this.initialized) {
      this.paddleOrbitRadius = Math.sqrt((paddleX - cx) ** 2 + (paddleY - cy) ** 2);
      this.sectorCenter      = paddleDirAngle;
      this.committedTargetAngle = paddleDirAngle;

      // isTopHalf must match paddle.ts: (Vec2(0,-1).dot(paddleDirection) > 0)
      // paddleDirection = (cos(paddleDirAngle), sin(paddleDirAngle))
      // dot with (0,-1) = -sin(paddleDirAngle)
      // isTopHalf = -sin(paddleDirAngle) > 0 = sin(paddleDirAngle) < 0
      this.isTopHalf = Math.sin(paddleDirAngle) < 0;

      // Sector width based on total wall count (not paddle count)
      const numWalls = (gameState.walls || []).length;
      this.sectorHalfWidth = Math.PI / Math.max(numWalls, 2);

      // The paddle can't reach beyond the sector boundaries.
      // Use 90% of sector half-width as the max reachable angle from center.
      this.maxPaddleAngle = this.sectorHalfWidth * 0.9;

      this.initialized = true;
    }

    // Refresh walls every frame to pick up elimination changes
    this.walls = [];
    this.myWallIndices = [];
    for (const w of (gameState.walls || [])) {
      if (Array.isArray(w)) {
        const idx = this.walls.length;
        this.walls.push({ ax: w[0], ay: w[1], bx: w[2], by: w[3], playerId: w[6] });
        if (w[6] === this.playerId) {
          this.myWallIndices.push(idx);
        }
      }
    }

    this.paddleAngle = Math.atan2(paddleY - cy, paddleX - cx);
    this.estimatedPaddleAngle = this.paddleAngle; // Sync estimate with real position on refresh
    this.paddleSpeed = boardPaddleSpeed;

    // ── Find the best ball to track ──

    let bestAngle: number | null = null;
    let bestTime  = Infinity;

    for (const b of balls) {
      let bx: number, by: number, vx: number, vy: number;
      if (Array.isArray(b)) {
        bx = b[0]; by = b[1]; vx = b[2]; vy = b[3];
      } else {
        bx = b.x; by = b.y; vx = b.vx ?? 0; vy = b.vy ?? 0;
      }
      if (vx * vx + vy * vy < 1) continue;

      const result = this.simulateTrajectory(bx, by, vx, vy, cx, cy);
      if (result && result.time < bestTime) {
        bestTime  = result.time;
        bestAngle = result.angle;
      }
    }

    // ── Clamp the detected angle to the paddle's reachable range ──
    if (bestAngle !== null) {
      const offsetFromCenter = angDiff(bestAngle, this.sectorCenter);
      const clamped = Math.max(-this.maxPaddleAngle, Math.min(this.maxPaddleAngle, offsetFromCenter));
      bestAngle = normalizeAngle(this.sectorCenter + clamped);
      this.lastBallDetectedTime = now;
    }

    // ── Fallback: track the most threatening ball when trajectory prediction fails ──
    // This prevents paddles from freezing after eliminations when the ball bounces
    // in patterns the trajectory simulation can't resolve within its bounce limit.
    // Prefer balls that are heading TOWARD our sector over those just nearby.
    let fallbackAngle: number | null = null;
    if (bestAngle === null && balls.length > 0) {
      let bestScore = -Infinity;
      for (const b of balls) {
        const bx2 = Array.isArray(b) ? b[0] : b.x;
        const by2 = Array.isArray(b) ? b[1] : b.y;
        const bvx = Array.isArray(b) ? b[2] : (b.vx ?? 0);
        const bvy = Array.isArray(b) ? b[3] : (b.vy ?? 0);
        const ballAngle = Math.atan2(by2 - cy, bx2 - cx);
        const angDistToSector = Math.abs(angDiff(ballAngle, this.sectorCenter));

        // Score: lower angular distance = better, heading toward sector = big bonus
        let score = -angDistToSector;
        const speed = Math.sqrt(bvx * bvx + bvy * bvy);
        if (speed > 1) {
          // Compute how much the ball velocity points toward our sector center
          const sectorX = Math.cos(this.sectorCenter);
          const sectorY = Math.sin(this.sectorCenter);
          // Vector from ball to our sector center on orbit
          const toSectorX = cx + sectorX * this.paddleOrbitRadius - bx2;
          const toSectorY = cy + sectorY * this.paddleOrbitRadius - by2;
          const toSectorLen = Math.sqrt(toSectorX * toSectorX + toSectorY * toSectorY);
          if (toSectorLen > 1) {
            // dot of normalized velocity with direction to our sector
            const dot = (bvx * toSectorX + bvy * toSectorY) / (speed * toSectorLen);
            // Bonus for heading toward us (dot > 0), penalty for heading away
            score += dot * 2.0;
          }
        }

        if (score > bestScore) {
          bestScore = score;
          fallbackAngle = ballAngle;
        }
      }
      if (fallbackAngle !== null) {
        // Always track — clamp to reachable range even if ball is outside sector.
        // This makes the AI move to the nearest edge instead of freezing.
        const offsetFromCenter = angDiff(fallbackAngle, this.sectorCenter);
        const clamped = Math.max(-this.maxPaddleAngle, Math.min(this.maxPaddleAngle, offsetFromCenter));
        fallbackAngle = normalizeAngle(this.sectorCenter + clamped);
      }
    }

    // ── Decide the raw target ──
    // If we see a ball, track it. If trajectory prediction failed but ball is in
    // our sector, track its current position. Otherwise hold or drift to center.
    let rawTarget: number;
    if (bestAngle !== null) {
      // Add difficulty-based prediction error
      if (this.params.predictionError > 0) {
        bestAngle = normalizeAngle(bestAngle + (Math.random() - 0.5) * 2 * this.params.predictionError);
        // Re-clamp after adding error
        const offsetFromCenter = angDiff(bestAngle, this.sectorCenter);
        const clamped = Math.max(-this.maxPaddleAngle, Math.min(this.maxPaddleAngle, offsetFromCenter));
        bestAngle = normalizeAngle(this.sectorCenter + clamped);
      }
      rawTarget = bestAngle;
      this.usingFallback = false;
    } else if (fallbackAngle !== null) {
      rawTarget = fallbackAngle;
      this.usingFallback = true;
      this.lastBallDetectedTime = now; // Keep the grace period alive while tracking
    } else if (now - this.lastBallDetectedTime < this.params.ballGracePeriodMs) {
      // No ball detected, but we recently saw one — hold position
      rawTarget = this.committedTargetAngle;
    } else {
      // No ball for a while — drift back to center
      rawTarget = this.sectorCenter;
    }

    // ── Committed target with hysteresis ──
    // When using fallback (trajectory failed), be more responsive:
    // reduce thresholds so the paddle doesn't hold a stale position.
    const commitThreshold = this.usingFallback
      ? this.params.commitThreshold * 0.5
      : this.params.commitThreshold;
    const commitLockout = this.usingFallback
      ? Math.min(this.params.commitLockoutMs, 16)
      : this.params.commitLockoutMs;

    if (!this.hasCommittedTarget) {
      this.committedTargetAngle = rawTarget;
      this.hasCommittedTarget = true;
      this.lastCommitTime = now;
      this.reachedTarget = false;
      this.lastUpdateTime = 0; // Reset so next update() gets a fresh dt
    } else {
      const shift = Math.abs(angDiff(rawTarget, this.committedTargetAngle));
      const timeSinceCommit = now - this.lastCommitTime;
      if (shift > commitThreshold && timeSinceCommit > commitLockout) {
        this.committedTargetAngle = rawTarget;
        this.lastCommitTime = now;
        this.reachedTarget = false;
        this.lastUpdateTime = 0; // Reset so next update() gets a fresh dt
      } else {
      }
    }

    // Only recalculate keys if we have a new target to move toward
    if (!this.reachedTarget) {
      this.calculateKeys();
    }
  }

  // ── Ball trajectory simulation with wall bounces ────

  private simulateTrajectory(
    bx: number, by: number, vx: number, vy: number,
    cx: number, cy: number,
  ): { angle: number; time: number } | null {
    let px = bx, py = by, dvx = vx, dvy = vy;
    let totalTime = 0;
    const orbitR = this.paddleOrbitRadius;
    const maxBounces = this.params.maxBounces;
    const maxTime    = 12;
    const sectorMatch = this.sectorHalfWidth * this.params.sectorMatchWidth;

    for (let bounce = 0; bounce <= maxBounces && totalTime < maxTime; bounce++) {
      const a = dvx * dvx + dvy * dvy;
      if (a < 1e-12) return null;

      // ── Nearest wall hit ──
      let wallT = Infinity, wallIdx = -1;
      for (let i = 0; i < this.walls.length; i++) {
        const w = this.walls[i]!;
        const t = this.raySegment(px, py, dvx, dvy, w.ax, w.ay, w.bx, w.by);
        if (t > 1e-4 && t < wallT) { wallT = t; wallIdx = i; }
      }

      // ── Check if ball crosses orbit circle before the wall hit ──
      const odx = px - cx, ody = py - cy;
      const bCoef = 2 * (dvx * odx + dvy * ody);
      const c     = odx * odx + ody * ody - orbitR * orbitR;
      const disc  = bCoef * bCoef - 4 * a * c;

      if (disc >= 0) {
        const sqrtD = Math.sqrt(disc);
        const t1 = (-bCoef - sqrtD) / (2 * a);
        const t2 = (-bCoef + sqrtD) / (2 * a);

        for (const t of [t1, t2]) {
          if (t > 1e-4 && t < wallT) {
            const hx = px + t * dvx, hy = py + t * dvy;
            const hitAngle = Math.atan2(hy - cy, hx - cx);
            if (Math.abs(angDiff(hitAngle, this.sectorCenter)) < sectorMatch) {
              return { angle: hitAngle, time: totalTime + t };
            }
          }
        }
      }

      // ── If ball hits our own wall, that's a direct threat ──
      // Project the wall-hit point onto the orbit circle to get the interception angle.
      if (wallIdx !== -1 && this.myWallIndices.includes(wallIdx)) {
        const hitX = px + wallT * dvx;
        const hitY = py + wallT * dvy;
        const hitAngle = Math.atan2(hitY - cy, hitX - cx);
        return { angle: hitAngle, time: totalTime + wallT };
      }

      // ── Bounce off neutral or opponent wall and continue ──
      if (wallIdx === -1) return null;
      totalTime += wallT;
      px += wallT * dvx;
      py += wallT * dvy;

      // Reflect velocity
      const w  = this.walls[wallIdx]!;
      const wdx = w.bx - w.ax, wdy = w.by - w.ay;
      const wLen = Math.sqrt(wdx * wdx + wdy * wdy);
      if (wLen < 1e-9) return null;
      const nx = -wdy / wLen, ny = wdx / wLen;
      const dot = dvx * nx + dvy * ny;
      dvx -= 2 * dot * nx;
      dvy -= 2 * dot * ny;

      // Nudge off wall
      const nDot = dvx * nx + dvy * ny;
      const sign = nDot > 0 ? 1 : -1;
      px += sign * nx * 0.5;
      py += sign * ny * 0.5;
    }
    return null;
  }

  /** Ray vs line-segment intersection; returns t > 0 or −1. */
  private raySegment(
    ox: number, oy: number, dx: number, dy: number,
    ax: number, ay: number, bx: number, by: number,
  ): number {
    const sdx = bx - ax, sdy = by - ay;
    const denom = dx * sdy - dy * sdx;
    if (Math.abs(denom) < 1e-9) return -1;
    const t = ((ax - ox) * sdy - (ay - oy) * sdx) / denom;
    const u = ((ax - ox) * dy  - (ay - oy) * dx)  / denom;
    return (t > 1e-6 && u >= -0.01 && u <= 1.01) ? t : -1;
  }

  // ── Key decision ────────────────────────────────────

  private calculateKeys(): void {
    this.calculateKeysFromAngle(this.paddleAngle);
  }

  private calculateKeysFromAngle(currentAngle: number): void {
    const diff   = angDiff(this.committedTargetAngle, currentAngle);
    const offset = Math.abs(diff) * this.paddleOrbitRadius;   // arc-length in pixels

    // Dead zone: stop moving when close enough to the target.
    const effectiveSpeed = this.paddleSpeed * this.params.speedMultiplier;
    // Use a small fixed frame time for dead zone calculation (not the 1s refresh)
    const perFramePx = effectiveSpeed * 0.032; // ~2 frames at 16ms
    const deadZone = Math.max(perFramePx * this.params.deadZoneMultiplier, this.params.minDeadZonePx);

    if (offset < deadZone) {
      this.currentKeys = [];
      return;
    }

    // Key mapping uses the FIXED isTopHalf from paddle construction.
    if (diff > 0) {
      this.currentKeys = [this.isTopHalf ? 'arrowright' : 'arrowleft'];
    } else {
      this.currentKeys = [this.isTopHalf ? 'arrowleft' : 'arrowright'];
    }
  }

  /**
   * Called every game frame (~16ms). Advances the estimated paddle position
   * based on current key direction and stops pressing keys when the estimated
   * position has reached the target — preventing overshoot between 1s refreshes.
   * This does NOT read the game state (compliant with 1s refresh rule).
   */
  public update(): void {

    // If paddle already reached target, stay still until next refresh gives a new target
    if (this.reachedTarget) {
      this.currentKeys = [];
      return;
    }

    const now = Date.now();
    if (this.lastUpdateTime === 0) {
      this.lastUpdateTime = now;
      return;
    }
    const dt = (now - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = now;

    // Check distance to target BEFORE moving
    const diffBefore = angDiff(this.committedTargetAngle, this.estimatedPaddleAngle);
    const offsetBefore = Math.abs(diffBefore) * this.paddleOrbitRadius;

    // Dead zone calculation
    const effectiveSpeed = this.paddleSpeed * this.params.speedMultiplier;
    const perFramePx = effectiveSpeed * 0.032;
    const deadZone = Math.max(perFramePx * this.params.deadZoneMultiplier, this.params.minDeadZonePx);

    // Already in dead zone → stop and lock
    if (offsetBefore < deadZone) {
      if (this.currentKeys.length > 0) {
      }
      this.currentKeys = [];
      this.reachedTarget = true;
      return;
    }

    // Advance estimated angle based on which keys are held
    if (this.currentKeys.length > 0 && this.paddleSpeed > 0 && this.paddleOrbitRadius > 0) {
      const angularSpeed = effectiveSpeed / this.paddleOrbitRadius;
      const step = angularSpeed * dt;

      // If the step would overshoot past the target, snap to target instead
      if (step >= Math.abs(diffBefore)) {
        this.estimatedPaddleAngle = this.committedTargetAngle;
        this.currentKeys = [];
        this.reachedTarget = true;
        return;
      }

      const key = this.currentKeys[0];
      let direction = 0;
      if (key === 'arrowright') direction = this.isTopHalf ? 1 : -1;
      else if (key === 'arrowleft') direction = this.isTopHalf ? -1 : 1;
      this.estimatedPaddleAngle = normalizeAngle(this.estimatedPaddleAngle + direction * step);
    }

    // Recalculate keys from estimated position
    this.calculateKeysFromAngle(this.estimatedPaddleAngle);


  }
}

// ─────────────────────────────────────────────────────────

export class AIManager {
  private controllers: Map<number, AIController> = new Map();

  public addAI(playerId: number, difficulty: AIDifficulty = AIDifficulty.MEDIUM): void {
    if (this.controllers.has(playerId)) return;
    this.controllers.set(playerId, new AIController(playerId, difficulty));
  }

  public refreshGameStates(gameState: any): void {
    const now = Date.now();
    for (const controller of this.controllers.values()) {
      if (controller.shouldRefresh(now)) {
        controller.refreshGameState(gameState, now);
      }
    }
  }

  public getControllers(): Map<number, AIController> {
    return this.controllers;
  }

  public getAIKeys(playerId: number): string[] {
    const controller = this.controllers.get(playerId);
    if (!controller) return [];
    controller.update();
    return controller.getKeys();
  }

  public getAISpeedMultiplier(playerId: number): number {
    const controller = this.controllers.get(playerId);
    if (!controller) return 1.0;
    return controller.getSpeedMultiplier();
  }

  public get count(): number {
    return this.controllers.size;
  }
}
