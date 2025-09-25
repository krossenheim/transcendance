import type { Vec2 } from './vector2.js'
import { scale, normalize } from './vector2.js'

export class PlayerPaddle {
  // private constants
  private readonly start_pos: Vec2;
  private readonly game_size: Vec2;

  public pos: Vec2;
  public dir: Vec2;

  constructor(start_pos: Vec2, game_size: Vec2) {
    this.start_pos = start_pos;
    this.game_size = game_size;
    this.pos = { ...start_pos };
    this.dir = { x: game_size.y / 2, y: game_size.x / 2 };
  }

  moveLateral(distance: number, toRight: boolean) {
    const len = Math.hypot(this.dir.x, this.dir.y);
    const d =
      len === 0 ? { x: 0, y: 0 } : { x: this.dir.x / len, y: this.dir.y / len };

    const lateral = toRight
      ? { x: d.y, y: -d.x } // right turn
      : { x: -d.y, y: d.x }; // left turn

    this.pos.x += lateral.x * distance;
    this.pos.y += lateral.y * distance;
  }
}

export default PlayerPaddle;