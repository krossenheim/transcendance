import type { Vec2 } from "./vector2.js";
import { scale, normalize } from "./vector2.js";

export class PlayerPaddle {
  // private constants
  private readonly game_size: Vec2;

  public pos: Vec2;
  public dir: Vec2;
  private speed: number;

  constructor(
    start_pos: Vec2,
    game_size: Vec2,
    speed = 10,
  ) {
    this.game_size = game_size;
    this.pos = { ...start_pos };
    this.dir = { x: game_size.y / 2, y: game_size.x / 2 };
    this.speed = speed;
  }

  move(deltaFactor: number) {
  }
}

export default PlayerPaddle;
