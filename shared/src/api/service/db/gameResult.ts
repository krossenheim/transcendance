import { gameIdValue, userIdValue } from '@app/shared/api/service/common/zodRules';
import { z } from 'zod';

export const GameResult = z.object({
  gameId: gameIdValue,
  userId: userIdValue,
  score: z.number(),
  rank: z.number(),
  createdAt: z.number().optional(),
});

export const GameResultsWidget = z.object({
  last_games: z.array(GameResult),
  wins: z.number(),
  total_games_played: z.number(),
  win_rate: z.number(),
}).strict();

export const MatchHistoryOpponent = z.object({
  userId: z.number(),
  username: z.string(),
  alias: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  score: z.number(),
  rank: z.number(),
});

export const MatchHistoryEntry = z.object({
  gameId: gameIdValue,
  score: z.number(),
  rank: z.number(),
  createdAt: z.number(),
  opponents: z.array(MatchHistoryOpponent),
});

export const MatchHistoryRow = z.object({
  gameId: gameIdValue,
  score: z.number(),
  rank: z.number(),
  createdAt: z.number(),
  opponentId: z.number().nullable(),
  opponentScore: z.number().nullable(),
  opponentRank: z.number().nullable(),
  opponentUsername: z.string().nullable(),
  opponentAlias: z.string().nullable(),
  opponentAvatarUrl: z.string().nullable(),
});

export type GameResultType = z.infer<typeof GameResult>;
export type GameResultsWidgetType = z.infer<typeof GameResultsWidget>;
export type MatchHistoryEntryType = z.infer<typeof MatchHistoryEntry>;
export type MatchHistoryRowType = z.infer<typeof MatchHistoryRow>;

export default {
  GameResult,
  GameResultsWidget,
  MatchHistoryEntry,
  MatchHistoryOpponent,
};

