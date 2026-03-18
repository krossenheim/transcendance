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
  private isTopHalf: boolean = false;     // fixed from paddle direction, determines key mapping

  // Current paddle angle (updated each frame from game state)
  private paddleAngle: number = 0;

  // Committed target angle — only updated when raw prediction differs significantly
  private committedTargetAngle: number = 0;
  private hasCommittedTarget: boolean = false;
  private lastCommitTime: number = 0;        // timestamp of last target commit
  private isMoving: boolean = false;         // whether the paddle was moving last frame

  // Arena walls (parsed once)
  private walls: WallData[] = [];
  private myWallIndices: number[] = [];  // indices of walls belonging to this player
  private myWallCenters: { x: number; y: number }[] = [];  // center of each owned wall
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
    for (const p of paddles) {
      const ownerId = Array.isArray(p) ? p[7] : (p?.owner_id ?? p?.ownerId ?? p?.player_id);
      if (ownerId === this.playerId) {
        paddleX        = Array.isArray(p) ? p[0] : p.x;
        paddleY        = Array.isArray(p) ? p[1] : p.y;
        paddleDirAngle = Array.isArray(p) ? p[2] : 0;
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

      this.walls = [];
      this.myWallIndices = [];
      this.myWallCenters = [];
      for (const w of (gameState.walls || [])) {
        if (Array.isArray(w)) {
          const idx = this.walls.length;
          this.walls.push({ ax: w[0], ay: w[1], bx: w[2], by: w[3], playerId: w[6] });
          if (w[6] === this.playerId) {
            this.myWallIndices.push(idx);
            this.myWallCenters.push({
              x: (w[0] + w[2]) / 2,
              y: (w[1] + w[3]) / 2,
            });
          }
        }
      }
      this.initialized = true;
    }

    this.paddleAngle = Math.atan2(paddleY - cy, paddleX - cx);

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

    // ── Fallback: Simple directional threat check ──
    // If trajectory simulation found nothing, check if any ball is heading
    // toward our wall centers. This catches cases the simulation misses.
    if (bestAngle === null) {
      let bestFallbackDist = Infinity;
      for (const b of balls) {
        let bx: number, by: number, vx: number, vy: number;
        if (Array.isArray(b)) {
          bx = b[0]; by = b[1]; vx = b[2]; vy = b[3];
        } else {
          bx = b.x; by = b.y; vx = b.vx ?? 0; vy = b.vy ?? 0;
        }
        const speed = Math.sqrt(vx * vx + vy * vy);
        if (speed < 1) continue;

        for (const wc of this.myWallCenters) {
          // Vector from ball to wall center
          const toWallX = wc.x - bx, toWallY = wc.y - by;
          const distToWall = Math.sqrt(toWallX * toWallX + toWallY * toWallY);
          if (distToWall < 1) continue;
          // Check if ball velocity points toward the wall (dot product > 0)
          const dot = vx * toWallX + vy * toWallY;
          if (dot <= 0) continue;
          // Estimate time to reach (rough)
          const timeEstimate = distToWall / speed;
          if (timeEstimate < bestFallbackDist) {
            bestFallbackDist = timeEstimate;
            // Project where the ball will be at estimated time, get angle from center
            const px = bx + vx * timeEstimate;
            const py = by + vy * timeEstimate;
            bestAngle = Math.atan2(py - cy, px - cx);
          }
        }
      }
    }

    // If no ball is heading our way, drift back to sector center
    const rawTarget = bestAngle ?? this.sectorCenter;

    // ── Committed target with hysteresis ──
    // Only update the committed target if the raw prediction has shifted
    // significantly AND enough time has passed. This prevents oscillation.
    const commitThreshold = 0.3;       // ~17 degrees — ignore smaller changes
    const commitLockoutMs = 200;       // minimum ms between target changes
    const now = Date.now();

    if (!this.hasCommittedTarget) {
      this.committedTargetAngle = rawTarget;
      this.hasCommittedTarget = true;
      this.lastCommitTime = now;
    } else {
      const shift = Math.abs(angDiff(rawTarget, this.committedTargetAngle));
      const timeSinceCommit = now - this.lastCommitTime;
      // Allow update if: big enough shift AND lockout expired, OR very large shift (emergency)
      if ((shift > commitThreshold && timeSinceCommit > commitLockoutMs) || shift > 0.8) {
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

    // Directional hysteresis: use a larger threshold to START moving,
    // and a smaller one to STOP. This prevents start-stop-start jitter.
    const startThreshold = 40;   // only start moving if >40px away
    const stopThreshold  = 12;   // keep moving until within 12px

    if (this.isMoving) {
      // Currently moving — stop only when close enough
      if (offset < stopThreshold) {
        this.currentKeys = [];
        this.isMoving = false;
        return;
      }
    } else {
      // Currently stopped — only start if far enough
      if (offset < startThreshold) {
        this.currentKeys = [];
        return;
      }
      this.isMoving = true;
    }

    // Key mapping uses the FIXED isTopHalf from paddle construction.
    // In paddle.ts:
    //   isTopHalf true:  arrowright → isClockwise=true  → moveDir=+1 → angle increases
    //                    arrowleft  → isClockwise=false → moveDir=-1 → angle decreases
    //   isTopHalf false: arrowleft  → isClockwise=true  → moveDir=+1 → angle increases
    //                    arrowright → isClockwise=false → moveDir=-1 → angle decreases
    if (diff > 0) {
      // Need to increase angle
      this.currentKeys = [this.isTopHalf ? 'arrowright' : 'arrowleft'];
    } else {
      // Need to decrease angle
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
