import type { Vec2 } from "./vector2.js";
import { scale, getAngle } from "./vector2.js";

const DEFAULT_PADDLE_SPEED = 500;

export class PlayerPaddle {
  // private constants
  private readonly start_pos: Vec2;
  private readonly game_size: Vec2;

  public readonly pos: Vec2;
  public readonly d: Vec2; // direction and rotation dont change on the fly
  public readonly r: number; // direction and rotation don't change on the fly
  public player_ID: number;
  private is_moving_right: boolean | null;
  private s: number;
  public length: number;

  constructor(
    start_pos: Vec2,
    game_size: Vec2,
    player_id: number,
    pladdle_speed = DEFAULT_PADDLE_SPEED
  ) {
    this.start_pos = start_pos;
    this.game_size = game_size;
    this.pos = { ...start_pos };
    this.r = getAngle(this.pos, this.game_size);
    this.d = { x: Math.cos(this.r), y: Math.sin(this.r) };
    this.player_ID = player_id;
    this.is_moving_right = null;
    this.s = pladdle_speed;
    this.length = Math.min(game_size.y, game_size.x) * 0.25;
  }

  setMoveOnNextFrame(toRight: boolean | null) {
    this.is_moving_right = toRight;
  }

  move(deltaFactor: number) {
    if (this.is_moving_right === null) {
      return;
    }

    const lateral = this.is_moving_right
      ? { x: this.d.y, y: -this.d.x } // right
      : { x: -this.d.y, y: this.d.x }; // left

    this.pos.x += lateral.x * deltaFactor * this.s;
    this.pos.y += lateral.y * deltaFactor * this.s;
  }
}

export default PlayerPaddle;
