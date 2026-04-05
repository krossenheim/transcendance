
const AI_PARAMS = {
  refreshIntervalMs: 1000,
  maxBounces: 15,
  commitThreshold: 0.06,
  commitLockoutMs: 50,
  deadZoneMultiplier: 0.06,
  minDeadZonePx: 10,
  predictionError: 0.06,
  sectorMatchWidth: 1.5,
  ballGracePeriodMs: 3000,
  speedMultiplier: 1.5,
};

function normalizeAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function angDiff(target: number, current: number): number {
  return normalizeAngle(target - current);
}

interface WallData {
  ax: number; ay: number;
  bx: number; by: number;
  playerId: number | null;
}

export class AIController {
  private playerId: number;
  private params = AI_PARAMS;
  private lastRefreshTime: number = 0;
  private currentKeys: string[] = [];

  private paddleOrbitRadius: number = 0;
  private sectorCenter: number = 0;
  private sectorHalfWidth: number = Math.PI;
  private maxPaddleAngle: number = Math.PI;
  private isTopHalf: boolean = false;

  private paddleAngle: number = 0;
  private paddleSpeed: number = 0;

  private estimatedPaddleAngle: number = 0;
  private lastUpdateTime: number = 0;
  private reachedTarget: boolean = false;

  private committedTargetAngle: number = 0;
  private hasCommittedTarget: boolean = false;
  private lastCommitTime: number = 0;
  private lastBallDetectedTime: number = 0;
  private usingFallback: boolean = false;

  private walls: WallData[] = [];
  private myWallIndices: number[] = [];
  private initialized: boolean = false;

  constructor(playerId: number) {
    this.playerId = playerId;
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

  public refreshGameState(gameState: any, timestamp: number = Date.now()): void {
    const now = timestamp;
    this.lastRefreshTime = now;
    if (!gameState) return;

    const cx = 500, cy = 500;
    const paddles = gameState.paddles || [];
    const balls   = gameState.balls   || [];

    let paddleX = 0, paddleY = 0;
    let paddleDirAngle = 0;
    let boardPaddleSpeed = 0;
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

    if (!this.initialized) {
      this.paddleOrbitRadius = Math.sqrt((paddleX - cx) ** 2 + (paddleY - cy) ** 2);
      this.sectorCenter      = paddleDirAngle;
      this.committedTargetAngle = paddleDirAngle;

      this.isTopHalf = Math.sin(paddleDirAngle) < 0;

      const numWalls = (gameState.walls || []).length;
      this.sectorHalfWidth = Math.PI / Math.max(numWalls, 2);

      this.maxPaddleAngle = this.sectorHalfWidth * 0.9;

      this.initialized = true;
    }

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
    this.estimatedPaddleAngle = this.paddleAngle;
    this.paddleSpeed = boardPaddleSpeed;

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

    if (bestAngle !== null) {
      const offsetFromCenter = angDiff(bestAngle, this.sectorCenter);
      const clamped = Math.max(-this.maxPaddleAngle, Math.min(this.maxPaddleAngle, offsetFromCenter));
      bestAngle = normalizeAngle(this.sectorCenter + clamped);
      this.lastBallDetectedTime = now;
    }

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

        let score = -angDistToSector;
        const speed = Math.sqrt(bvx * bvx + bvy * bvy);
        if (speed > 1) {
          const sectorX = Math.cos(this.sectorCenter);
          const sectorY = Math.sin(this.sectorCenter);
          const toSectorX = cx + sectorX * this.paddleOrbitRadius - bx2;
          const toSectorY = cy + sectorY * this.paddleOrbitRadius - by2;
          const toSectorLen = Math.sqrt(toSectorX * toSectorX + toSectorY * toSectorY);
          if (toSectorLen > 1) {
            const dot = (bvx * toSectorX + bvy * toSectorY) / (speed * toSectorLen);
            score += dot * 2.0;
          }
        }

        if (score > bestScore) {
          bestScore = score;
          fallbackAngle = ballAngle;
        }
      }
      if (fallbackAngle !== null) {
        const offsetFromCenter = angDiff(fallbackAngle, this.sectorCenter);
        const clamped = Math.max(-this.maxPaddleAngle, Math.min(this.maxPaddleAngle, offsetFromCenter));
        fallbackAngle = normalizeAngle(this.sectorCenter + clamped);
      }
    }

    let rawTarget: number;
    if (bestAngle !== null) {
      if (this.params.predictionError > 0) {
        bestAngle = normalizeAngle(bestAngle + (Math.random() - 0.5) * 2 * this.params.predictionError);
        const offsetFromCenter = angDiff(bestAngle, this.sectorCenter);
        const clamped = Math.max(-this.maxPaddleAngle, Math.min(this.maxPaddleAngle, offsetFromCenter));
        bestAngle = normalizeAngle(this.sectorCenter + clamped);
      }
      rawTarget = bestAngle;
      this.usingFallback = false;
    } else if (fallbackAngle !== null) {
      rawTarget = fallbackAngle;
      this.usingFallback = true;
      this.lastBallDetectedTime = now;
    } else if (now - this.lastBallDetectedTime < this.params.ballGracePeriodMs) {
      rawTarget = this.committedTargetAngle;
    } else {
      rawTarget = this.sectorCenter;
    }

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
      this.lastUpdateTime = 0;
    } else {
      const shift = Math.abs(angDiff(rawTarget, this.committedTargetAngle));
      const timeSinceCommit = now - this.lastCommitTime;
      if (shift > commitThreshold && timeSinceCommit > commitLockout) {
        this.committedTargetAngle = rawTarget;
        this.lastCommitTime = now;
        this.reachedTarget = false;
        this.lastUpdateTime = 0;
      } else {
      }
    }

    if (!this.reachedTarget) {
      this.calculateKeys();
    }
  }

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

      let wallT = Infinity, wallIdx = -1;
      for (let i = 0; i < this.walls.length; i++) {
        const w = this.walls[i]!;
        const t = this.raySegment(px, py, dvx, dvy, w.ax, w.ay, w.bx, w.by);
        if (t > 1e-4 && t < wallT) { wallT = t; wallIdx = i; }
      }

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

      if (wallIdx !== -1 && this.myWallIndices.includes(wallIdx)) {
        const hitX = px + wallT * dvx;
        const hitY = py + wallT * dvy;
        const hitAngle = Math.atan2(hitY - cy, hitX - cx);
        return { angle: hitAngle, time: totalTime + wallT };
      }

      if (wallIdx === -1) return null;
      totalTime += wallT;
      px += wallT * dvx;
      py += wallT * dvy;

      const w  = this.walls[wallIdx]!;
      const wdx = w.bx - w.ax, wdy = w.by - w.ay;
      const wLen = Math.sqrt(wdx * wdx + wdy * wdy);
      if (wLen < 1e-9) return null;
      const nx = -wdy / wLen, ny = wdx / wLen;
      const dot = dvx * nx + dvy * ny;
      dvx -= 2 * dot * nx;
      dvy -= 2 * dot * ny;

      const nDot = dvx * nx + dvy * ny;
      const sign = nDot > 0 ? 1 : -1;
      px += sign * nx * 0.5;
      py += sign * ny * 0.5;
    }
    return null;
  }

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

  private calculateKeys(): void {
    this.calculateKeysFromAngle(this.paddleAngle);
  }

  private calculateKeysFromAngle(currentAngle: number): void {
    const diff   = angDiff(this.committedTargetAngle, currentAngle);
    const offset = Math.abs(diff) * this.paddleOrbitRadius;

    const effectiveSpeed = this.paddleSpeed * this.params.speedMultiplier;
    const perFramePx = effectiveSpeed * 0.032;
    const deadZone = Math.max(perFramePx * this.params.deadZoneMultiplier, this.params.minDeadZonePx);

    if (offset < deadZone) {
      this.currentKeys = [];
      return;
    }

    if (diff > 0) {
      this.currentKeys = [this.isTopHalf ? 'arrowright' : 'arrowleft'];
    } else {
      this.currentKeys = [this.isTopHalf ? 'arrowleft' : 'arrowright'];
    }
  }

  public update(): void {

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

    const diffBefore = angDiff(this.committedTargetAngle, this.estimatedPaddleAngle);
    const offsetBefore = Math.abs(diffBefore) * this.paddleOrbitRadius;

    const effectiveSpeed = this.paddleSpeed * this.params.speedMultiplier;
    const perFramePx = effectiveSpeed * 0.032;
    const deadZone = Math.max(perFramePx * this.params.deadZoneMultiplier, this.params.minDeadZonePx);

    if (offsetBefore < deadZone) {
      if (this.currentKeys.length > 0) {
      }
      this.currentKeys = [];
      this.reachedTarget = true;
      return;
    }

    if (this.currentKeys.length > 0 && this.paddleSpeed > 0 && this.paddleOrbitRadius > 0) {
      const angularSpeed = effectiveSpeed / this.paddleOrbitRadius;
      const step = angularSpeed * dt;

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

    this.calculateKeysFromAngle(this.estimatedPaddleAngle);

  }
}

export class AIManager {
  private controllers: Map<number, AIController> = new Map();

  public addAI(playerId: number): void {
    if (this.controllers.has(playerId)) return;
    this.controllers.set(playerId, new AIController(playerId));
  }

  public refreshAll(gameState: any): void {
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

