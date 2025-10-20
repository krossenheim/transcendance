import { z } from "zod";

export const StartNewPongGameSchema = z.object({
  player_list: z.array(z.coerce.number()).refine(
    (arr) => {
      // Check uniqueness
      return new Set(arr).size === arr.length;
    },
    {
      message: "playerList must contain unique numbers",
    }
  ),
}).strict();

export const PongBallSchema = z.object({
  id: z.coerce.number(),
  x: z.coerce.number(),
  y: z.coerce.number(),
  dx: z.coerce.number().min(-1).max(1),
  dy: z.coerce.number().min(-1).max(1),
}).strict();

export const PongPaddleSchema = z.object({
  x: z.coerce.number(),
  y: z.coerce.number(),
  l: z.coerce.number().gt(0),
  w: z.coerce.number().gt(0),
  r: z.coerce.number(),
}).strict();

const PongEdgeSchema = z.object({
  x: z.coerce.number(),
  y: z.coerce.number(),
}).strict();

export const MovePaddlePayloadScheme = z.object({
  board_id: z.coerce.number().int().positive(), //board id
  m: z.union([z.boolean(), z.null()]), // move right = yyes , left = no, not = null
}).strict();

export const GameStateSchema = z.object({
  balls: z.array(PongBallSchema),
  paddles: z.array(PongPaddleSchema),
  edges: z.array(PongEdgeSchema),
}).strict();

export type TypeMovePaddlePayloadScheme = z.infer<typeof MovePaddlePayloadScheme>;
export type TypeStartNewPongGame = z.infer<typeof PongPaddleSchema>;
export type TypeGameStateSchema = z.infer<typeof GameStateSchema>;
export type TypePongEdgeSchema = z.infer<typeof PongEdgeSchema>;
export type TypePongPaddle = z.infer<typeof PongPaddleSchema>;
export type TypePongBall = z.infer<typeof PongBallSchema>;
