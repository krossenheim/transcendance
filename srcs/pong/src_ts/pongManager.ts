import PongGame from './pongGame.js'

export class PongManager {
  private pong_instances: Array<PongGame>;
  public static instance: PongManager;

  constructor() {
    this.pong_instances = new Array();
    if (PongManager.instance) {
      return PongManager.instance;
    }
    PongManager.instance = this;
    return this;
  }

  startGame(board_x: number, board_y: number, num_players: number): boolean {
    const pong_game = PongGame.create({ x: board_x, y: board_y }, num_players);
    if (!pong_game) {
      return false;
    }
    this.pong_instances.push(pong_game);
    return true;
  }
}

export default PongManager;
