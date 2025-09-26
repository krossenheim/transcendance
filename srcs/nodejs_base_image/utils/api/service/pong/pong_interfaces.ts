import { xid, z } from "zod";
import type { Vec2 } from "../common/vector2.js";

export const StartNewPongGameSchema = z.object({
  player_list: z.array(z.number()).refine((arr) => {
    // Check uniqueness
    return new Set(arr).size === arr.length;
  }, {
	message: "playerList must contain unique numbers"
  }),
});


export const PongBall = z.object({
  x: z.number().int().gt(0),
  y: z.number().int().gt(0),
  dx: z.number().int().gt(0),
  dy: z.number().int().gt(0),
});

export const PongPaddle = z.object({
  x: z.number().int().gt(0),
  y: z.number().int().gt(0),
  dx: z.number().int().gt(0),
  dy: z.number().int().gt(0),
  l: z.number().int().gt(0),
});

