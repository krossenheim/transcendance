import { z } from "zod";

export const StartNewPongGameSchema = z.object({
  player_list: z.array(z.number()).refine(
    (arr) => {
      // Check uniqueness
      return new Set(arr).size === arr.length;
    },
    {
      message: "playerList must contain unique numbers",
    }
  ),
});

export const PongBallSchema = z.object({
  id: z.number().gt(0),
  x: z.number().gt(0),
  y: z.number().gt(0),
  dx: z.number().min(-1).max(1),
  dy: z.number().min(-1).max(1),
  r: z.number()
});

export const PongPaddleSchema = z.object({
  x: z.number().gt(0),
  y: z.number().gt(0),
  l: z.number().int().gt(0),
  w: z.number().int().gt(0),
  r: z.number(),
});

export const MovePaddlePayloadScheme = z.object({
  b: z.number().int().positive(), //board id
  m: z.union([z.boolean(), z.null()]), // move right = yyes , left = no, not = null
});

export type TypeMovePaddlePayloadScheme = z.infer<typeof PongPaddleSchema>;
export type TypeStartNewPongGame = z.infer<typeof PongPaddleSchema>;
export type TypePongPaddle = z.infer<typeof PongPaddleSchema>;
export type TypePongBall = z.infer<typeof PongBallSchema>;
