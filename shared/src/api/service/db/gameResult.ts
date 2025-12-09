import { gameIdValue, userIdValue } from '@app/shared/api/service/common/zodRules';
import { z } from 'zod';

export const GameResult = z.object({
  gameId: gameIdValue,
  userId: userIdValue,
  score: z.number(),
  rank: z.number(),
});

export const GameResultsWidget = z.object({
  last_games: z.array(GameResult),
  wins: z.number(),
  total_games_played: z.number(),
  win_rate: z.number(),
}).strict();

export type GameResultType = z.infer<typeof GameResult>;
export type GameResultsWidgetType = z.infer<typeof GameResultsWidget>;

export default {
  GameResult,
  GameResultsWidget,
};