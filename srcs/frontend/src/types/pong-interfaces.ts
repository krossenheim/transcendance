// Minimal pong interfaces for frontend rendering
export interface TypeHandleGameKeysSchema { board_id: number; pressed_keys: string[] }
export interface TypeStartNewPongGame { player_list: number[]; balls: number }
export interface TypePlayerDeclaresReadyForGame { game_id: number }
export interface TypePlayerReadyForGameSchema { user_id: number; game_id: number }
export interface TypePaddleState { x: number; y: number; w: number; l: number; r: number; owner_id: number; paddle_id: number }
export interface TypeBallState { id: number; x: number; y: number; dx: number; dy: number; radius?: number }
export interface TypeEdgeState { x: number; y: number }
export interface TypePowerupState { x: number; y: number; type: number; spawnTime?: number }
export interface TypeGameStateSchema { 
  board_id: number | null; 
  edges: TypeEdgeState[]; 
  paddles: TypePaddleState[]; 
  balls: TypeBallState[];
  metadata?: { elapsedTime?: number; gameOptions?: any } | null;
  powerups?: TypePowerupState[];
  score?: { [key: number]: number } | null;
}
