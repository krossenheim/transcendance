import type PlayerPaddle from "playerPaddle.js";
import type { Vec2 } from "./utils/api/service/common/vector2.js";
// import { scale, normalize, toward } from "./utils/api/service/common/vector2.js";

function randomAvoidAxes(epsilon = 0.05): number {
  const quarter = Math.PI / 2;

  const quarterIndex = Math.floor(Math.random() * 4);
  // pick a random angle inside the quarter, avoiding epsilon at edges
  const r =
    quarterIndex * quarter + epsilon + Math.random() * (quarter - 2 * epsilon);
  return r;
}

export class PongBall {
  // private constants
  private readonly game_size: Vec2;

  public pos: Vec2;
  public r: number;
  public d: Vec2;
  public s: number;

  constructor(start_pos: Vec2, game_size: Vec2, speed = 250) {
    this.game_size = game_size;
    this.pos = { ...start_pos };
    this.r = randomAvoidAxes();
    this.s = speed;
    this.d = { x: Math.cos(this.r), y: Math.sin(this.r) };
  }

  updateTheta() {
    this.d.x = Math.cos(this.r);
    this.d.y = Math.sin(this.r);
  }

  reflectX() {
    this.r = Math.PI - this.r; // update angle
    this.d.x = Math.cos(this.r); // update direction vector
    this.d.y = Math.sin(this.r);
  }

  reflectY() {
    this.r = -this.r; // update angle
    this.d.x = Math.cos(this.r); // update direction vector
    this.d.y = Math.sin(this.r);
  }

  move(deltaFactor: number) {
    this.pos.x += this.d.x * deltaFactor * this.s;
    this.pos.y += this.d.y * deltaFactor * this.s;

    if (this.pos.x < 0) {
      this.pos.x = 0;
      this.reflectX();
    } else if (this.pos.x > this.game_size.x) {
      this.pos.x = this.game_size.x;
      this.reflectX();
    }

    if (this.pos.y < 0) {
      this.pos.y = 0;
      this.reflectY();
    } else if (this.pos.y > this.game_size.y) {
      this.pos.y = this.game_size.y;
      this.reflectY();
    }
  }

  collidesWithEdges(edges : CollidableEdges[], deltaTime: number)
  {
	for (const collidable_edge of edges)
	{
		const a = collidable_edge.a;
		const b = collidable_edge.b;
		const direction = collidable_edge.direction;

		const line = a + deltaTime * direction;
	}
  }
}

type CollidableEdges = {
  a: Vec2;
  b: Vec2;
  direction: Vec2;
};

export default PongBall;
