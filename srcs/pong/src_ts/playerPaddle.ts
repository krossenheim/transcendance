import type { Vec2 } from "./utils/api/service/common/vector2.js";
import { scale, toward } from "./utils/api/service/common/vector2.js";

const DEFAULT_PADDLE_SPEED = 10;

export class PlayerPaddle {
  // private constants
  private readonly start_pos: Vec2;
  private readonly game_size: Vec2;

  public pos: Vec2;
  public dir: Vec2;
  public player_ID: number;
  private is_moving_right: boolean | null;
  private paddle_speed: number;
  public length: number;

  constructor(
    start_pos: Vec2,
    game_size: Vec2,
    player_id: number,
    paddle_speed = DEFAULT_PADDLE_SPEED
  ) {
    this.start_pos = start_pos;
    this.game_size = game_size;
    this.pos = { ...start_pos };
    this.dir = toward(this.pos, { x: game_size.y / 2, y: game_size.x / 2 });
    this.player_ID = player_id;
    this.is_moving_right = null;
    this.paddle_speed = paddle_speed;
    this.length = Math.min(game_size.y, game_size.x) * 0.25;
  }

  // applyPlayerInput(player_input: any, deltaFactor: number) {

  //   this.moveLateral(distance, to_right);
  // }

  setMoveOnNextFrame(toRight: boolean) {
    this.is_moving_right = toRight;
  }

  move(deltaFactor: number) {
    if (this.is_moving_right === null) {
      return;
    }
    const len = Math.hypot(this.dir.x, this.dir.y);
    const d =
      len === 0 ? { x: 0, y: 0 } : { x: this.dir.x / len, y: this.dir.y / len };

    const lateral = this.is_moving_right
      ? { x: d.y, y: -d.x } // right 
      : { x: -d.y, y: d.x }; // left

    const distance = deltaFactor * this.paddle_speed;
    this.pos.x += lateral.x * distance;
    this.pos.y += lateral.y * distance;
    this.is_moving_right = null;
  }
}

export default PlayerPaddle;
