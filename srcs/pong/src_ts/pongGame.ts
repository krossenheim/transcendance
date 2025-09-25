import type { Vec2 } from './vector2.js'
import { scale, normalize } from './vector2.js'
import PlayerPaddle from './playerPaddle.js'

const MIN_PLAYERS: number = 2;
const MAX_PLAYERS: number = 8;

function generateCirclePoints(n: number, radius = 1, offset: Vec2): Vec2[] {
  if (n < 2 || n > 8) throw new Error("n must be between 2 and 8");

  const points: Vec2[] = [];
  const angleStep = (2 * Math.PI) / n; // step in radians

  for (let i = 0; i < n; i++) {
    const angle = i * angleStep;
    points.push({
      x: Math.cos(angle) * radius + offset.x,
      y: Math.sin(angle) * radius + offset.y,
    });
  }

  return points;
}

class PongGame {
  private board_size: Vec2;
  private num_players: number;
  private player_paddles: Array<PlayerPaddle>;

  private constructor(board_size: Vec2, num_players: number) {
    this.num_players = num_players;
    this.board_size = board_size;
    this.player_paddles = [];
    this.initialize_board();
  }

  static create(board_size: Vec2, num_players: number) {
    if (num_players < MIN_PLAYERS || num_players > MAX_PLAYERS) return null;
    if (board_size.x < 1 || board_size.y < 1) {
      return null;
    }
    return new PongGame(board_size, num_players);
  }

  initialize_board() {
    const paddle_positions = generateCirclePoints(
      this.num_players,
      this.board_size.x * 0.95,
      { x: this.board_size.y, y: -this.board_size.x }
    );

    for (const vector of paddle_positions) {
      this.player_paddles.push(new PlayerPaddle(vector, this.board_size));
    }
    console.log(`Initialized ${this.num_players} paddles`);
  }
}

export default PongGame;
