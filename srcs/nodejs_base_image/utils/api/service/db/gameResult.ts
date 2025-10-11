import { gameIdValue, userIdValue } from '../common/zodRules.js';
import { z } from 'zod';

export const GameResult = z.object({
  id: gameIdValue,
  userId: userIdValue,
  score: z.number(),
  rank: z.number(),
});

export type GameResultType = z.infer<typeof GameResult>;

export default {
  GameResult,
};