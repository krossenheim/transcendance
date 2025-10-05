import type { Vec2 } from "./vector2.js"
import { is_zero, normalize } from "./vector2.js"
import PlayerPaddle from "./playerPaddle.js"
import PongBall from "./pongBall.js"
import generateCirclePoints from "./generateCirclePoints.js"

const MIN_PLAYERS: number = 2
const MAX_PLAYERS: number = 8

class PongGame {
  private board_size: Vec2
  public player_paddles: Array<PlayerPaddle>
  public player_to_paddle: Map<number, PlayerPaddle>
  public players: Array<number>
  public pong_balls: Array<PongBall>
  private last_frame_time: number
  private readonly timefactor: number = 1

  private constructor(player_ids: Array<number>) {
    this.players = player_ids
    this.board_size = { x: 1000, y: 1000 }
    this.pong_balls = []
    this.player_paddles = []
    this.player_to_paddle = new Map()
    this.last_frame_time = Date.now()
    this.initializeBoard(player_ids)
  }

  static create(player_ids: Array<number>): PongGame | null {
    if (new Set(player_ids).size !== player_ids.length) {
      console.error("Non unique ids passed as player_ids")
      return null
    }
    if (player_ids.length < MIN_PLAYERS || player_ids.length > MAX_PLAYERS) return null
    return new PongGame(player_ids)
  }

  initializeBoard(player_ids: Array<number>) {
    const paddle_positions = generateCirclePoints(
      player_ids.length,
      Math.min(this.board_size.x, this.board_size.y) * 0.25,
      { x: this.board_size.y / 2, y: this.board_size.x / 2 },
    )

    let idxpaddle = 0
    for (const player_id of player_ids) {
      const vector = paddle_positions[idxpaddle++]
      if (vector === undefined) {
        throw Error("There should be as many paddle positions as players.")
      }
      const paddle = new PlayerPaddle(vector, this.board_size, player_id)
      this.player_to_paddle.set(player_id, paddle)
      this.player_paddles.push(paddle)
    }

    for (let i = 0; i < 5; i++) {
      const randomOffset = {
        x: (Math.random() - 0.5) * 100,
        y: (Math.random() - 0.5) * 100,
      }
      this.pong_balls.push(
        new PongBall(
          {
            x: this.board_size.x / 2 + randomOffset.x,
            y: this.board_size.y / 2 + randomOffset.y,
          },
          this.board_size,
        ),
      )
    }
  }

  setInputOnPaddle(user_id: number, move_right: boolean | null) {
    const paddle = this.player_to_paddle.get(user_id)
    if (!paddle) {
      throw new Error("Should not be trying to find a player that isnt in this.players.")
    }
    paddle.setMoveOnNextFrame(move_right)
  }

  private tempSquareBoundaries() {
    for (const ball of this.pong_balls) {
      if (ball.pos.x - ball.radius < 0) {
        ball.pos.x = ball.radius
        ball.dir.x = Math.abs(ball.dir.x)
        ball.dir = normalize(ball.dir)
      } else if (ball.pos.x + ball.radius > this.board_size.x) {
        ball.pos.x = this.board_size.x - ball.radius
        ball.dir.x = -Math.abs(ball.dir.x)
        ball.dir = normalize(ball.dir)
      }

      if (ball.pos.y - ball.radius < 0) {
        ball.pos.y = ball.radius
        ball.dir.y = Math.abs(ball.dir.y)
        ball.dir = normalize(ball.dir)
      } else if (ball.pos.y + ball.radius > this.board_size.y) {
        ball.pos.y = this.board_size.y - ball.radius
        ball.dir.y = -Math.abs(ball.dir.y)
        ball.dir = normalize(ball.dir)
      }
    }
  }

  gameLoop() {
    const currentTime = Date.now()
    const deltaTime = (currentTime - this.last_frame_time) / 1000
    this.last_frame_time = currentTime
    const deltaFactor = this.timefactor * deltaTime

    for (const paddle of this.player_paddles) {
      const p_movement = paddle.getMove(deltaFactor)
      paddle.lastMovement = p_movement
      if (is_zero(p_movement)) continue
      paddle.pos.x += p_movement.x
      paddle.pos.y += p_movement.y
      for (let i = 0; i < paddle.segment.length; i++) {
        paddle.segment[i]!.x += p_movement.x
        paddle.segment[i]!.y += p_movement.y
      }
    }

    for (const pong_ball of this.pong_balls) {
      const pb_movement = pong_ball.getMove(deltaFactor)
      pong_ball.movePaddleAware(pb_movement, this.player_paddles)
    }

    this.tempSquareBoundaries()
  }

  getGameState() {
    return {
      balls: this.pong_balls.map((b) => ({
        id: b.id,
        x: b.pos.x,
        y: b.pos.y,
        r: b.radius,
        dx: b.dir.x,
        dy: b.dir.y,
      })),
      paddles: this.player_paddles.map((p) => ({
        id: p.player_ID,
        a1: p.segment[0]!.x,
        a2: p.segment[0]!.y,
        b1: p.segment[1]!.x,
        b2: p.segment[1]!.y,
        w: p.width,
      })),
    }
  }
}

export default PongGame
