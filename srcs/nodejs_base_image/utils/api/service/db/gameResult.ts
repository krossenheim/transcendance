import { z } from 'zod';

export const GameResult = z.object({
  id: z.number(),
  userId: z.number(),
  score: z.number(),
  rank: z.number(),
});

export type GameResultType = z.infer<typeof GameResult>;

export default {
  GameResult,
};