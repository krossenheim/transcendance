/**
 * AI Controller for Pong
 *
 * Simulates ball trajectory with wall bounces to predict where
 * the ball will reach the paddle's orbit, then moves there.
 * Uses a committed target with hysteresis to prevent jitter.
 */

const AI_REFRESH_INTERVAL_MS = 16;

export enum AIDifficulty {
  EASY = 1,
  MEDIUM = 2,
  HARD = 3,
}

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

  // Committed target angle — only updated when raw prediction differs significantly
  private committedTargetAngle: number = 0;
  private hasCommittedTarget: boolean = false;
  private lastCommitTime: number = 0;        // timestamp of last target commit
  private lastBallDetectedTime: number = 0;  // when we last saw a ball heading our way

  // Arena walls (parsed once)
  private walls: WallData[] = [];
  private myWallIndices: number[] = [];  // indices of walls belonging to this player
  private initialized: boolean = false;

  constructor(playerId: number, _difficulty: AIDifficulty = AIDifficulty.MEDIUM) {
    this.playerId = playerId;
  }

  public getKeys(): string[] {
    return this.currentKeys;
  }

  public shouldRefresh(currentTime: number): boolean {
    return currentTime - this.lastRefreshTime >= AI_REFRESH_INTERVAL_MS;
  }

  // ── Main update ──────────────────────────────────────

  public refreshGameState(gameState: any): void {
    this.lastRefreshTime = Date.now();
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

    // One-time initialisation
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
      this.initialized = true;
    }

    this.paddleAngle = Math.atan2(paddleY - cy, paddleX - cx);
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

    const now = Date.now();

    // ── Clamp the detected angle to the paddle's reachable range ──
    if (bestAngle !== null) {
      const offsetFromCenter = angDiff(bestAngle, this.sectorCenter);
      const clamped = Math.max(-this.maxPaddleAngle, Math.min(this.maxPaddleAngle, offsetFromCenter));
      bestAngle = normalizeAngle(this.sectorCenter + clamped);
      this.lastBallDetectedTime = now;
    }

    // ── Decide the raw target ──
    // If we see a ball, track it. If not, keep the last committed target
    // for a grace period before falling back to sector center.
    const ballGracePeriodMs = 1500;  // keep last target for 1.5s after losing the ball
    let rawTarget: number;
    if (bestAngle !== null) {
      rawTarget = bestAngle;
    } else if (now - this.lastBallDetectedTime < ballGracePeriodMs) {
      // No ball detected, but we recently saw one — hold position
      rawTarget = this.committedTargetAngle;
    } else {
      // No ball for a while — drift back to center
      rawTarget = this.sectorCenter;
    }

    // ── Committed target with hysteresis ──
    const commitThreshold = 0.15;      // ~8.6 degrees — ignore smaller changes
    const commitLockoutMs = 150;       // minimum ms between target changes

    if (!this.hasCommittedTarget) {
      this.committedTargetAngle = rawTarget;
      this.hasCommittedTarget = true;
      this.lastCommitTime = now;
    } else {
      const shift = Math.abs(angDiff(rawTarget, this.committedTargetAngle));
      const timeSinceCommit = now - this.lastCommitTime;
      if (shift > commitThreshold && timeSinceCommit > commitLockoutMs) {
        this.committedTargetAngle = rawTarget;
        this.lastCommitTime = now;
      }
    }

    this.calculateKeys();
  }

  // ── Ball trajectory simulation with wall bounces ────

  private simulateTrajectory(
    bx: number, by: number, vx: number, vy: number,
    cx: number, cy: number,
  ): { angle: number; time: number } | null {
    let px = bx, py = by, dvx = vx, dvy = vy;
    let totalTime = 0;
    const orbitR = this.paddleOrbitRadius;
    const maxBounces = 12;
    const maxTime    = 8;

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
            if (Math.abs(angDiff(hitAngle, this.sectorCenter)) < this.sectorHalfWidth * 2.0) {
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
    const diff   = angDiff(this.committedTargetAngle, this.paddleAngle);
    const offset = Math.abs(diff) * this.paddleOrbitRadius;   // arc-length in pixels

    // Compute per-frame displacement at current paddle speed.
    // Thresholds prevent oscillation while keeping the paddle responsive.
    // The paddle moves at ~45px per frame and stops instantly when keys are released.
    // If we're within one frame's displacement, stop — pressing a key would overshoot.
    // The paddle is ~53px half-width, so stopping 45px from exact target still catches the ball.
    const frameMs = AI_REFRESH_INTERVAL_MS;
    const perFramePx = this.paddleSpeed * (frameMs / 1000);
    const deadZone = Math.max(perFramePx, 20);

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

  public update(): void {
    // Keys are calculated during refreshGameState
  }
}

// ─────────────────────────────────────────────────────────

export class AIManager {
  private controllers: Map<number, AIController> = new Map();

  public addAI(playerId: number, difficulty: AIDifficulty = AIDifficulty.MEDIUM): void {
    if (this.controllers.has(playerId)) return;
    this.controllers.set(playerId, new AIController(playerId, difficulty));
    console.log(`[AIManager] Added AI for player ${playerId}`);
  }

  public refreshGameStates(gameState: any): void {
    const now = Date.now();
    for (const controller of this.controllers.values()) {
      if (controller.shouldRefresh(now)) {
        controller.refreshGameState(gameState);
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

  public get count(): number {
    return this.controllers.size;
  }
}
