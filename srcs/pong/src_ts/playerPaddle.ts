import type PlayerPaddle from "./playerPaddle.js"
import type { Vec2 } from "./vector2.js"
import { is_zero, normalize, sub, dotp, scale, add } from "./vector2.js"

function randomAvoidAxes(epsilon = 0.05): number {
  const quarter = Math.PI / 2
  const quarterIndex = Math.floor(Math.random() * 4)
  const r = quarterIndex * quarter + epsilon + Math.random() * (quarter - 2 * epsilon)
  return r
}

export class PongBall {
  private readonly game_size: Vec2
  public pos: Vec2
  public radius: number
  public dir: Vec2
  public speed: number
  public id: number
  private static debugcountstatic = 0
  private collisionCooldown: Map<number, number> = new Map()
  private readonly COOLDOWN_FRAMES = 3

  constructor(start_pos: Vec2, game_size: Vec2, speed = 300) {
    this.game_size = game_size
    this.id = PongBall.debugcountstatic++
    this.pos = { ...start_pos }
    this.radius = 8
    const r = randomAvoidAxes()
    this.speed = speed
    this.dir = normalize({ x: Math.cos(r), y: Math.sin(r) })
  }

  getMove(deltaFactor: number): Vec2 {
    const wantedMove = {
      x: this.dir.x * deltaFactor * this.speed,
      y: this.dir.y * deltaFactor * this.speed,
    }
    if (is_zero(wantedMove)) {
      throw Error("Ball speed is zero this isn't expected.")
    }
    return wantedMove
  }

  movePaddleAware(movement_vec: Vec2, paddles: PlayerPaddle[]) {
    for (const [paddleId, cooldown] of this.collisionCooldown.entries()) {
      if (cooldown > 0) {
        this.collisionCooldown.set(paddleId, cooldown - 1)
      }
    }

    // Check each paddle for collision
    for (const paddle of paddles) {
      const cooldown = this.collisionCooldown.get(paddle.player_ID) || 0
      if (cooldown > 0) {
        continue
      }

      const A = paddle.segment[0]!
      const B = paddle.segment[1]!
      const AB = sub(B, A)
      const AB_len2 = dotp(AB, AB)
      if (AB_len2 < 1e-8) continue

      // Find closest point on paddle center line to ball
      const AP = sub(this.pos, A)
      const t_seg = Math.max(0, Math.min(1, dotp(AP, AB) / AB_len2))
      const closest = add(A, scale(t_seg, AB))
      const diff = sub(this.pos, closest)
      const dist2 = dotp(diff, diff)

      const halfPaddleWidth = paddle.width / 2
      const effectiveRadius = this.radius + halfPaddleWidth

      // Check if ball is colliding with paddle
      if (dist2 <= effectiveRadius * effectiveRadius) {
        const distToCenter = Math.sqrt(dist2)
        const normal = distToCenter > 1e-8 ? scale(1 / distToCenter, diff) : { x: 1, y: 0 }

        const velocityDotNormal = dotp(this.dir, normal)
        if (velocityDotNormal >= 0) {
          // Ball is moving away from paddle, don't reflect
          continue
        }

        const overlap = effectiveRadius - distToCenter
        if (overlap > 0) {
          const separation = scale(overlap + 1, normal)
          this.pos = add(this.pos, separation)
        }

        // Reflect direction
        this.reflectDirection(normal)

        this.collisionCooldown.set(paddle.player_ID, this.COOLDOWN_FRAMES)

        return
      }
    }

    // No collision - move normally
    this.pos.x += movement_vec.x
    this.pos.y += movement_vec.y
  }

  private reflectDirection(normal: Vec2) {
    // Reflect the ball's direction using the collision normal
    const dotProduct = dotp(this.dir, normal)
    const reflection = scale(2 * dotProduct, normal)
    this.dir = sub(this.dir, reflection)
    this.dir = normalize(this.dir)

    const minAwaySpeed = 0.3
    const awayComponent = dotp(this.dir, normal)
    if (awayComponent < minAwaySpeed) {
      const correction = scale(minAwaySpeed - awayComponent, normal)
      this.dir = normalize(add(this.dir, correction))
    }
  }
}

export default PongBall
