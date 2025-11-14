// Minimal pong interfaces for frontend rendering
export interface TypeMovePaddlePayloadScheme { board_id: number; paddle_id: number; m: boolean | null }
export interface TypeStartNewPongGame { player_list: number[]; balls: number }
export interface TypePlayerDeclaresReadyForGame { game_id: number }
export interface TypePlayerReadyForGameSchema { user_id: number; game_id: number }
export interface TypePaddleState { x: number; y: number; w: number; l: number; r: number; owner_id: number; paddle_id: number }
export interface TypeBallState { x: number; y: number; vx?: number; vy?: number }
export interface TypeEdgeState { x: number; y: number }
export interface TypeGameStateSchema { board_id: number | null; edges: TypeEdgeState[]; paddles: TypePaddleState[]; balls: TypeBallState[] }
