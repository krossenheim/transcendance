import type { Vec2 } from "./vector2.js";
import { scale, getAngle, normalize } from "./vector2.js";

const DEFAULT_PADDLE_SPEED = 700;

function makeRectangle(
  pos: Vec2,
  dir: Vec2,
  width: number,
  length: number
): Vec2[] {
  // dir should be normalized at this stage.
  let forward = normalize(dir)

  // perpendicular (rotate 90° CCW)
  let right = {
    x: forward.y,
    y: -forward.x,
  };

  // half extents
  let halfW = length / 2;
  let halfL = width / 2;

  // scale vectors
  let r = { x: forward.x * halfL, y: forward.y * halfL };
  let f = { x: right.x * halfW, y: right.y * halfW };

  // 4 corners
  let p1 = { x: pos.x + f.x + r.x, y: pos.y + f.y + r.y };
  let p2 = { x: pos.x + f.x - r.x, y: pos.y + f.y - r.y };
  let p3 = { x: pos.x - f.x - r.x, y: pos.y - f.y - r.y };
  let p4 = { x: pos.x - f.x + r.x, y: pos.y - f.y + r.y };

  let rectangle = [p1, p2, p3, p4];
  return rectangle;
}

export class PlayerPaddle {
  // private constants
  private readonly start_pos: Vec2;
  private readonly game_size: Vec2;

  public pos: Vec2;
  public readonly d: Vec2; // direction and rotation dont change on the fly
  public readonly r: number; // direction and rotation don't change on the fly
  public player_ID: number;
  public is_moving_right: boolean | null;
  public s: number;
  public length: number;
  public width: number;
  public polygon: Vec2[];
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
    this.width = this.length / 10;
    this.polygon = makeRectangle(this.pos, this.d, this.width, this.length);
    this.lastMovement = { x: 0, y: 0 };
    this.player_ID = player_id;
    this.is_moving_right = null;
    this.s = pladdle_speed;
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
