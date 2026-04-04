// Minimal pong interfaces for frontend rendering
export interface TypeHandleGameKeysSchema { board_id: number; pressed_keys: string[]; clientTimestamp?: number }
export interface TypeStartNewPongGame { player_list: number[]; balls: number; allowPowerups?: boolean }
export interface TypePlayerDeclaresReadyForGame { game_id: number }
export interface TypePlayerReadyForGameSchema { user_id: number; game_id: number }
export interface TypePaddleState { x: number; y: number; w: number; l: number; r: number; owner_id: number; paddle_id: number }
export interface TypeBallState { id: number; x: number; y: number; dx: number; dy: number; radius?: number }
export interface TypeEdgeState { x: number; y: number; playerId?: number | null }
export interface TypePowerupState { x: number; y: number; type: number; spawnTime?: number }

// Powerup types enum (mirrors backend)
export enum PowerupType {
  ADD_BALL = 0,
  INCREASE_PADDLE_SPEED = 1,
  DECREASE_PADDLE_SPEED = 2,
  SUPER_SPEED = 3,
  INCREASE_BALL_SIZE = 4,
  DECREASE_BALL_SIZE = 5,
  REVERSE_CONTROLS = 6,
}

// Active time-based effect
export interface TypeActiveEffect {
  type: number;
  typeName: string;
  remainingTicks: number;
  remainingSeconds: number;
}

// Recent instant powerup event (for notifications)
export interface TypeRecentEvent {
  type: number;
  typeName: string;
  ageSeconds: number;
}

export interface TypeGameStateSchema { 
  board_id: number | null; 
  edges: TypeEdgeState[]; 
  paddles: TypePaddleState[]; 
  balls: TypeBallState[];
  metadata?: { elapsedTime?: number; gameOptions?: any; timeScale?: number } | null;
  powerups?: TypePowerupState[];
  activeEffects?: TypeActiveEffect[];
  recentEvents?: TypeRecentEvent[];
  score?: { [key: number]: number } | null;
  gameOver?: boolean;
  winner?: number | null;
}
