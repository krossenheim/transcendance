/**
 * AI Controller for Pong - Simple version
 * 
 * Logic:
 * 1. Check if ball is coming toward paddle
 * 2. Calculate where ball will hit
 * 3. Move paddle to that position
 * 4. Stop when there
 */

const AI_REFRESH_INTERVAL_MS = 16;  // ~60fps for smoother response

export enum AIDifficulty {
  EASY = 1,
  MEDIUM = 2,
  HARD = 3,
}

export class AIController {
  private playerId: number;
  private lastRefreshTime: number = 0;
  private currentKeys: string[] = [];
  
  // Paddle state
  private paddleX: number = 0;
  private paddleY: number = 0;
  
  // Target position (absolute coordinates where ball will hit)
  private targetX: number = 0;
  private targetY: number = 0;
  
  // Is ball coming toward us?
  private ballApproaching: boolean = false;
  
  // Have we calculated a target for the current approach?
  private hasTarget: boolean = false;
  
  // Fixed paddle orbit radius (calculated once when paddle is first seen)
  private paddleOrbitRadius: number = 0;
  
  // Current movement direction
  private currentDirection: number = 0;  // -1, 0, or 1
  
  // Time-based lock to prevent oscillation
  private lastMoveTime: number = 0;
  private readonly MOVE_COOLDOWN_MS = 100;  // 100ms cooldown after stopping
  
  constructor(playerId: number, _difficulty: AIDifficulty = AIDifficulty.MEDIUM) {
    this.playerId = playerId;
  }
  
  public getKeys(): string[] {
    return this.currentKeys;
  }
  
  public shouldRefresh(currentTime: number): boolean {
    return currentTime - this.lastRefreshTime >= AI_REFRESH_INTERVAL_MS;
  }
  
  public refreshGameState(gameState: any): void {
    this.lastRefreshTime = Date.now();
    if (!gameState) return;
    
    // Get paddle position
    const paddles = gameState.paddles || [];
    
    for (const p of paddles) {
      const ownerId = Array.isArray(p) ? p[7] : (p?.owner_id ?? p?.ownerId ?? p?.player_id);
      if (ownerId === this.playerId) {
        if (Array.isArray(p)) {
          this.paddleX = p[0];
          this.paddleY = p[1];
        } else {
          this.paddleX = p.x;
          this.paddleY = p.y;
        }
        break;
      }
    }
    
    // Arena center
    const centerX = 500;
    const centerY = 500;
    
    // Calculate paddle's orbit radius (do this once, then keep it fixed)
    if (this.paddleOrbitRadius === 0) {
      this.paddleOrbitRadius = Math.sqrt(
        (this.paddleX - centerX) * (this.paddleX - centerX) + 
        (this.paddleY - centerY) * (this.paddleY - centerY)
      );
    }
    const paddleRadius = this.paddleOrbitRadius;
    
    // Check if ball is approaching and calculate intercept point
    const balls = gameState.balls || [];
    let interceptPoint: { x: number; y: number } | null = null;
    
    for (const b of balls) {
      let bx: number, by: number, vx: number, vy: number;
      if (Array.isArray(b)) {
        // Ball format: [x, y, vx, vy, radius, inverseMass, id]
        bx = b[0]; by = b[1]; vx = b[2]; vy = b[3];
      } else {
        bx = b.x; by = b.y; vx = b.vx ?? 0; vy = b.vy ?? 0;
      }
      
      const velLen = Math.sqrt(vx * vx + vy * vy);
      if (velLen < 1) continue; // No velocity
      
      // Check if ball is heading toward paddle's region
      const toPaddleX = this.paddleX - bx;
      const toPaddleY = this.paddleY - by;
      const dist = Math.sqrt(toPaddleX * toPaddleX + toPaddleY * toPaddleY);
      if (dist < 1) continue;
      
      // Calculate where ball will cross circle at paddle's radius
      // Line-circle intersection: find t where |ballPos + t*velocity - center|² = radius²
      const dx = bx - centerX;
      const dy = by - centerY;
      
      // Quadratic: a*t² + b*t + c = 0
      const a = vx * vx + vy * vy;
      const bCoef = 2 * (vx * dx + vy * dy);
      const c = dx * dx + dy * dy - paddleRadius * paddleRadius;
      
      const discriminant = bCoef * bCoef - 4 * a * c;
      if (discriminant < 0) continue; // No intersection
      
      const sqrtDisc = Math.sqrt(discriminant);
      const t1 = (-bCoef - sqrtDisc) / (2 * a);
      const t2 = (-bCoef + sqrtDisc) / (2 * a);
      
      // Pick the positive t (future intersection)
      let t = -1;
      if (t1 > 0 && t2 > 0) t = Math.min(t1, t2);
      else if (t1 > 0) t = t1;
      else if (t2 > 0) t = t2;
      
      if (t < 0) continue; // No future intersection
      
      // Calculate intercept point
      const ix = bx + t * vx;
      const iy = by + t * vy;
      
      // Check if intercept is in our sector (within 60 degrees of our paddle angle)
      const interceptAngle = Math.atan2(iy - centerY, ix - centerX);
      const paddleAngleOnCircle = Math.atan2(this.paddleY - centerY, this.paddleX - centerX);
      
      let sectorDiff = interceptAngle - paddleAngleOnCircle;
      // Normalize to [-PI, PI]
      while (sectorDiff > Math.PI) sectorDiff -= 2 * Math.PI;
      while (sectorDiff < -Math.PI) sectorDiff += 2 * Math.PI;
      
      // Only respond if intercept is within our sector
      // Use double sector width to ensure AI reacts to balls heading near their area
      const numPaddles = paddles.length;
      const sectorWidth = (2 * Math.PI) / Math.max(numPaddles, 3);
      const allowedSectorDiff = sectorWidth * 1.5;
      
      if (Math.abs(sectorDiff) > allowedSectorDiff) continue;
      
      interceptPoint = { x: ix, y: iy };
      break;
    }
    
    if (interceptPoint) {
      this.targetX = interceptPoint.x;
      this.targetY = interceptPoint.y;
      this.hasTarget = true;
      this.ballApproaching = true;
    } else {
      this.ballApproaching = false;
      this.hasTarget = false;
    }
    
    this.calculateKeys();
  }
  
  private calculateKeys(): void {
    const keys: string[] = [];
    
    // If no ball approaching or no target, stop
    if (!this.ballApproaching || !this.hasTarget) {
      this.currentDirection = 0;
      this.currentKeys = keys;
      return;
    }
    
    // Arena center
    const centerX = 500;
    const centerY = 500;
    
    // Calculate angles on the circle (both paddle and target are on the same orbit)
    const paddleAngleOnCircle = Math.atan2(this.paddleY - centerY, this.paddleX - centerX);
    const targetAngleOnCircle = Math.atan2(this.targetY - centerY, this.targetX - centerX);
    
    // Angular difference (how far to rotate)
    let angleDiff = targetAngleOnCircle - paddleAngleOnCircle;
    // Normalize to [-PI, PI]
    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    
    // Convert to a pixel-like scale for thresholds (1 radian ~= 450 pixels at radius 450)
    const offset = angleDiff * this.paddleOrbitRadius;
    
    // Moderate thresholds
    const startThreshold = 80;  // Start moving when offset > 80
    const stopThreshold = 40;   // Stop moving when offset < 40
    
    const now = Date.now();
    
    // Calculate desired direction with hysteresis and cooldown
    // Positive offset = target is counter-clockwise from paddle
    if (this.currentDirection === 0) {
      // Currently stopped - check cooldown before starting
      const timeSinceStop = now - this.lastMoveTime;
      if (timeSinceStop > this.MOVE_COOLDOWN_MS) {
        if (offset > startThreshold) {
          this.currentDirection = 1;  // Go counter-clockwise (increasing angle)
        } else if (offset < -startThreshold) {
          this.currentDirection = -1;  // Go clockwise (decreasing angle)
        }
      }
    } else if (this.currentDirection === 1) {
      // Currently moving counter-clockwise - stop when close
      if (offset < stopThreshold) {
        this.currentDirection = 0;
        this.lastMoveTime = now;  // Start cooldown
      }
    } else if (this.currentDirection === -1) {
      // Currently moving clockwise - stop when close
      if (offset > -stopThreshold) {
        this.currentDirection = 0;
        this.lastMoveTime = now;  // Start cooldown
      }
    }
    
    // Map direction to keys
    // From tracing paddle.ts:
    // - clockwiseBaseVelocity = paddleDirection.perp() (90° counter-clockwise rotation)
    // - For top paddle facing up (0,-1): perp = (1,0) = moves right
    // - Moving right at top = counter-clockwise = angle INCREASES
    // So for isTopHalf=true:
    //   arrowright → isClockwise=true → moveDir=+1 → angle INCREASES
    //   arrowleft → isClockwise=false → moveDir=-1 → angle DECREASES
    // For isTopHalf=false (bottom):
    //   arrowright → isClockwise=false → moveDir=-1 → angle DECREASES  
    //   arrowleft → isClockwise=true → moveDir=+1 → angle INCREASES
    const isTopHalf = Math.sin(paddleAngleOnCircle) < 0;
    
    if (this.currentDirection === 1) {
      // Need to INCREASE angle (positive offset means target has higher angle)
      const key = isTopHalf ? 'arrowright' : 'arrowleft';
      keys.push(key);
    } else if (this.currentDirection === -1) {
      // Need to DECREASE angle (negative offset means target has lower angle)  
      const key = isTopHalf ? 'arrowleft' : 'arrowright';
      keys.push(key);
    }
    
    this.currentKeys = keys;
  }
  
  public update(): void {
    // Keys calculated during refreshGameState
  }
}

export class AIManager {
  private controllers: Map<number, AIController> = new Map();
  
  public addAI(playerId: number, difficulty: AIDifficulty = AIDifficulty.MEDIUM): void {
    if (this.controllers.has(playerId)) return;
    const controller = new AIController(playerId, difficulty);
    this.controllers.set(playerId, controller);
    console.log(`[AIManager] Added AI for player ${playerId}`);
  }
  
  public removeAI(playerId: number): void {
    this.controllers.delete(playerId);
  }
  
  public clear(): void {
    this.controllers.clear();
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
  
  public isAI(playerId: number): boolean {
    return this.controllers.has(playerId);
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
