import type { TypeGameStateSchema } from "../../../types/pong-interfaces"

type PendingInput = { timestamp: number; keys: string[]; sequenceNumber: number }

// Simple local simulation state
interface LocalBall { id: number; x: number; y: number; dx: number; dy: number; radius: number }
interface LocalPaddle { playerId: number; x: number; y: number; angle: number; width: number; height: number; vx: number; vy: number; speed: number }

export class ClientPredictionManager {
  private localPlayerId: number
  private balls: LocalBall[] = []
  private paddles: LocalPaddle[] = []
  private pendingInputs: PendingInput[] = []
  private inputSequence = 0
  private initialized = false
  // lastServerTimestamp intentionally omitted (not used)
  private readonly MAX_PREDICTION_ERROR = 12 // px

  // default options (used if server doesn't send gameOptions)
  private paddleSpeed = 300 // units per second

  constructor(playerId: number) {
    this.localPlayerId = playerId
  }

  public initializeGame(players: number[], options: any, initialState: TypeGameStateSchema) {
    this.initialized = true
    if (options?.paddleSpeed) this.paddleSpeed = options.paddleSpeed

    // Seed local balls and paddles from server state
    this.balls = (initialState.balls || []).map((b: any, idx: number) => ({
      id: b.id ?? idx,
      x: b.x ?? 0,
      y: b.y ?? 0,
      dx: b.dx ?? 0,
      dy: b.dy ?? 0,
      radius: (b as any).radius ?? 10,
    }))

    this.paddles = (initialState.paddles || []).map((p: any, idx: number) => ({
      playerId: (p as any).playerId ?? (p as any).paddle_id ?? idx,
      x: (p as any).x ?? (Array.isArray(p) ? p[0] : 0),
      y: (p as any).y ?? (Array.isArray(p) ? p[1] : 0),
      angle: (p as any).angle ?? (Array.isArray(p) ? p[2] : 0),
      width: (p as any).width ?? (Array.isArray(p) ? p[3] : 50),
      height: (p as any).height ?? (Array.isArray(p) ? p[4] : 10),
      vx: (p as any).vx ?? 0,
      vy: (p as any).vy ?? 0,
      speed: (p as any).speed ?? this.paddleSpeed,
    }))

    // ignore server timestamp for now
  }

  public isInitialized(): boolean {
    return this.initialized
  }

  public update(deltaTime: number, currentKeys: string[]) {
    if (!this.initialized) return

    const now = performance.now()

    // store input for replay/reconciliation
    this.pendingInputs.push({ timestamp: now, keys: [...currentKeys], sequenceNumber: this.inputSequence++ })

    // Advance balls using simple linear motion
    for (const b of this.balls) {
      b.x += b.dx * deltaTime
      b.y += b.dy * deltaTime
    }

    // Apply input to local player paddle(s)
    const leftPressed = currentKeys.includes("arrowleft") || currentKeys.includes("a")
    const rightPressed = currentKeys.includes("arrowright") || currentKeys.includes("d")

    for (const paddle of this.paddles) {
      if (paddle.playerId !== this.localPlayerId) continue
      let move = 0
      if (leftPressed) move -= 1
      if (rightPressed) move += 1
      const dx = move * paddle.speed * deltaTime
      paddle.x += dx
      paddle.vx = dx / Math.max(1e-6, deltaTime)
    }
  }

  public reconcileWithServer(serverState: TypeGameStateSchema) {
    if (!this.initialized) {
      this.initializeGame([], undefined, serverState)
      return
    }

    // compute max error for balls
    let maxError = 0
    for (const sb of serverState.balls) {
      const local = this.balls.find((b) => b.id === sb.id)
      if (local) {
        const err = Math.hypot(local.x - sb.x, local.y - sb.y)
        maxError = Math.max(maxError, err)
      }
    }

    // If large error, snap to server and replay inputs
    if (maxError > this.MAX_PREDICTION_ERROR) {
      // apply server state
      this.balls = (serverState.balls || []).map((b: any, idx: number) => ({
        id: b.id ?? idx,
        x: b.x ?? 0,
        y: b.y ?? 0,
        dx: b.dx ?? 0,
        dy: b.dy ?? 0,
        radius: (b as any).radius ?? 10,
      }))

      this.paddles = (serverState.paddles || []).map((p: any, idx: number) => ({
        playerId: (p as any).playerId ?? (p as any).paddle_id ?? idx,
        x: (p as any).x ?? (Array.isArray(p) ? p[0] : 0),
        y: (p as any).y ?? (Array.isArray(p) ? p[1] : 0),
        angle: (p as any).angle ?? (Array.isArray(p) ? p[2] : 0),
        width: (p as any).width ?? (Array.isArray(p) ? p[3] : 50),
        height: (p as any).height ?? (Array.isArray(p) ? p[4] : 10),
        vx: (p as any).vx ?? 0,
        vy: (p as any).vy ?? 0,
        speed: (p as any).speed ?? this.paddleSpeed,
      }))

      // Replay pending inputs after server timestamp
      const serverTime = (serverState as any).serverTime ?? 0
      const toReplay = this.pendingInputs.filter((i) => i.timestamp > serverTime)
      for (let i = 0; i < toReplay.length; i++) {
        const cur = toReplay[i]!
        const next = toReplay[i + 1]
        const dt = next ? (next.timestamp - cur.timestamp) / 1000 : 0.016
        this.update(dt, cur.keys)
      }
    } else {
      // small error: softly blend towards server positions
      for (const sb of serverState.balls) {
        const local = this.balls.find((b) => b.id === sb.id)
        if (local) {
          local.x = local.x * 0.9 + sb.x * 0.1
          local.y = local.y * 0.9 + sb.y * 0.1
          local.dx = sb.dx
          local.dy = sb.dy
        }
      }
    }
  }

  public getPredictedState() {
    return {
      balls: this.balls.map((b) => [b.x, b.y, b.dx, b.dy, b.radius, 1 / (Math.PI * b.radius * b.radius), b.id]),
      paddles: this.paddles.map((p) => [p.x, p.y, p.angle, p.width, p.height, p.vx, p.vy, p.playerId, p.speed]),
    }
  }

  public getLocalPlayerId(): number {
    return this.localPlayerId
  }

  public isGameOver(): boolean {
    return false
  }
}
