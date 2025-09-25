import type { Vec2 } from "./vector2.js";
import { scale, normalize } from "./vector2.js";

export class PlayerPaddle {
  // private constants
  private readonly game_size: Vec2;

  public pos: Vec2;
  public dir: Vec2;
  private speed: number;

  constructor(start_pos: Vec2, game_size: Vec2, speed = 10) {
    this.game_size = game_size;
    this.pos = { ...start_pos };
    this.dir = { x: game_size.y / 2, y: game_size.x / 2 };
    this.speed = speed;
  }

  move(deltaFactor: number) {
    this.pos.x += this.dir.x * this.speed * deltaFactor;
    this.pos.y += this.dir.y * this.speed * deltaFactor;

    if (this.pos.x < 0) {
      this.pos.x = 0;
      this.dir.x *= -1;
    } else if (this.pos.x > this.game_size.x) {
      this.pos.x = this.game_size.x;
      this.dir.x *= -1;
    }

    if (this.pos.y < 0) {
      this.pos.y = 0;
      this.dir.y *= -1;
    } else if (this.pos.y > this.game_size.y) {
      this.pos.y = this.game_size.y;
      this.dir.y *= -1;
    }
  }
}
export default PlayerPaddle;
