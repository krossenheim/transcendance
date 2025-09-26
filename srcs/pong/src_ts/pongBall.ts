import type { Vec2 } from "./utils/api/service/common/vector2.js";
// import { scale, normalize, toward } from "./utils/api/service/common/vector2.js";

  function randomAvoidAxes(): Vec2 {
    // pick a random angle between 0 and 2π, avoiding multiples of π/2
    let angle: number;
    do {
      angle = Math.random() * Math.PI * 2;
    } while (Math.abs(angle % (Math.PI/2)) < 0.05); // tiny epsilon to skip axes
    return  {x: Math.cos(angle), y: Math.sin(angle)};
  }


export class PongBall {
  // private constants
  private readonly game_size: Vec2;

  public pos: Vec2;
  public dir: Vec2;
  private speed: number;

  constructor(start_pos: Vec2, game_size: Vec2, speed = 250) {
    this.game_size = game_size;
    this.pos = { ...start_pos };
    this.dir = randomAvoidAxes();
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
export default PongBall;
