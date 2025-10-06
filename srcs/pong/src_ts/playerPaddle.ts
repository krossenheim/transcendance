import type { Vec2 } from "./vector2.js";
import { scale, getAngle, normalize } from "./vector2.js";

const DEFAULT_PADDLE_SPEED = 300;

export class PlayerPaddle {
  // private constants
  private readonly start_pos: Vec2;
  private readonly game_size: Vec2;
  public static totalPaddles : number = 0;
  public readonly id : number;
  public pos: Vec2;
  public readonly d: Vec2; // direction and rotation dont change on the fly
  public readonly r: number; // direction and rotation don't change on the fly
  public player_ID: number;
  public is_moving_right: boolean | null;
  public s: number;
  public length: number;
  public readonly width: number;
  public segment: Vec2[];
  public lastMovement: Vec2;
  constructor(
    start_pos: Vec2,
    game_size: Vec2,
    player_id: number,
    pladdle_speed = DEFAULT_PADDLE_SPEED
  ) {
    this.start_pos = start_pos;
    this.game_size = game_size;
    this.pos = { ...start_pos };
    this.r = getAngle(this.pos, {
      x: this.game_size.x / 2,
      y: this.game_size.y / 2,
    });
    this.d = { x: Math.cos(this.r), y: Math.sin(this.r) };
    this.length = Math.min(game_size.y, game_size.x) * 0.25;
    this.width = 20;
    this.segment = this.makeSegment(this.pos, this.d, this.length);
    this.lastMovement = { x: 0, y: 0 };
    this.player_ID = player_id;
    this.is_moving_right = null;
    this.s = pladdle_speed;
    this.id = (++PlayerPaddle.totalPaddles); 
  }
  makeSegment(pos: Vec2, dir: Vec2, length: number): Vec2[] {
    const forward = normalize(dir); // unit vector along dir
    // perpendicular vector (+90° rotation)
    const perp = { x: -forward.y, y: forward.x };

    // offset along the perpendicular
    const halfL = length / 2;
    const offset = { x: perp.x * halfL, y: perp.y * halfL };

    const p1 = { x: pos.x + offset.x, y: pos.y + offset.y };
    const p2 = { x: pos.x - offset.x, y: pos.y - offset.y };

    return [p1, p2];
  }

  setMoveOnNextFrame(toRight: boolean | null) {
    this.is_moving_right = toRight;
  }

  getMove(deltaFactor: number): Vec2 {
    if (this.is_moving_right === null) {
      return { x: 0, y: 0 };
    }

    const lateral = this.is_moving_right
      ? { x: this.d.y, y: -this.d.x } // right
      : { x: -this.d.y, y: this.d.x }; // left
    return scale(deltaFactor * this.s, lateral);
  }
}

export default PlayerPaddle;
