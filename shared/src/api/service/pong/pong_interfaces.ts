import { z } from "zod";
import { gameIdValue, userIdValue, anyPlayerIdValue } from "@app/shared/api/service/common/zodRules";

const player_list_rule = z.array(z.coerce.number()).refine(
  (arr) => {
    const counts = arr.reduce<Record<number, number>>((acc, id) => {
      acc[id] = (acc[id] || 0) + 1;
      return acc;
    }, {});

    return Object.values(counts).every((count) => count <= 2);
  },
  {
    message: "N omore than 2 player IDS in a given pong game.",
  }
);
export const StartNewPongGameSchema = z
  .object({
    balls: z.coerce.number().int().gt(0).lt(1000),
    player_list: player_list_rule,
    allowPowerups: z.boolean().optional(),
  })
  .strict();

export const PongBallSchema = z
  .tuple([
    z.coerce.number(),
    z.coerce.number(),
    z.coerce.number(),
    z.coerce.number(),
    z.coerce.number(),
    z.coerce.number(),
    z.coerce.number(),
  ]);

export const PongPaddleSchema = z
  .tuple([
    z.coerce.number(),
    z.coerce.number(),
    z.coerce.number(),
    z.coerce.number(),
    z.coerce.number(),
    z.coerce.number(),
    z.coerce.number(),
    z.coerce.number(),
    z.coerce.number(),
  ]);

const PongWallSchema = z
  .tuple([
    z.coerce.number(),
    z.coerce.number(),
    z.coerce.number(),
    z.coerce.number(),
    z.coerce.number(),
    z.coerce.number(),
    z.coerce.number().nullable(),
  ]);

export const HandleGameKeysSchema = z
  .object({
    board_id: gameIdValue,
    pressed_keys: z.array(z.string()),
    clientTimestamp: z.number().optional(),
  })
  .strict();

export const GameStateSchema = z
  .object({
    board_id: gameIdValue,
    balls: z.array(PongBallSchema),
    paddles: z.array(PongPaddleSchema),
    walls: z.array(PongWallSchema),
  })
  .passthrough();

export const GetGameInfoSchema = z
  .object({
    board_id: gameIdValue,
    player_list: player_list_rule,
  })
  .strict();

export const PlayerReadyForGameSchema = z
  .object({
    game_id: gameIdValue,
    user_id: userIdValue.optional(),
  })
  .strict();

export const PlayerDeclaresReadyForGame = z
  .object({
    game_id: gameIdValue,
  })
  .strict();

export const GameModeSchema = z.enum(["1v1", "multiplayer", "tournament", "lastOneStanding"]);

export const CreateLobbySchema = z
  .object({
    gameMode: GameModeSchema,
    playerIds: z.array(userIdValue),
    playerUsernames: z.record(z.string(), z.string()).optional(),
    ballCount: z.coerce.number().int().min(1).max(5),
    maxScore: z.coerce.number().int().min(0).max(21),
    allowPowerups: z.boolean().optional().default(false),
    aiCount: z.coerce.number().int().min(0).max(7).optional().default(0),
    aiDifficulty: z.coerce.number().int().min(1).max(4).optional().default(3),
    localPlayerNames: z.array(z.string().min(1).max(20)).optional(),
  })
  .strict();

export const LobbyPlayerSchema = z
  .object({
    userId: anyPlayerIdValue,
    username: z.string(),
    isReady: z.boolean(),
    isHost: z.boolean(),
  })
  .strict();

export const TournamentPlayerSchema = z
  .object({
    userId: anyPlayerIdValue,
    username: z.string(),
    alias: z.string().optional(),
  })
  .strict();

export const TournamentMatchSchema = z
  .object({
    matchId: gameIdValue,
    round: z.coerce.number().int().min(1),
    player1Id: anyPlayerIdValue.nullable(),
    player2Id: anyPlayerIdValue.nullable(),
    winnerId: anyPlayerIdValue.nullable(),
    status: z.enum(["pending", "in_progress", "completed"]),
    gameId: gameIdValue.optional(),
    readyPlayers: z.array(anyPlayerIdValue).default([]),
  })
  .strict();

export const TournamentDataSchema = z
  .object({
    tournamentId: gameIdValue,
    name: z.string(),
    mode: z.literal("tournament"),
    players: z.array(TournamentPlayerSchema),
    matches: z.array(TournamentMatchSchema),
    currentRound: z.coerce.number().int().min(1),
    totalRounds: z.coerce.number().int().min(1),
    status: z.enum(["registration", "in_progress", "completed"]),
    winnerId: anyPlayerIdValue.nullable(),
    ballCount: z.coerce.number(),
    maxScore: z.coerce.number(),
    allowPowerups: z.boolean().default(false),
    aiDifficulty: z.coerce.number().default(3),
    onchainTxHashes: z.array(z.string()).optional(),
    isLocal: z.boolean().optional(),
    hostUserId: anyPlayerIdValue.optional(),
  })
  .strict();

export const LobbyDataSchema = z
  .object({
    lobbyId: gameIdValue,
    gameMode: GameModeSchema,
    players: z.array(LobbyPlayerSchema),
    ballCount: z.coerce.number(),
    maxScore: z.coerce.number(),
    allowPowerups: z.boolean(),
    aiCount: z.coerce.number().int().min(0).max(7).optional().default(0),
    aiDifficulty: z.coerce.number().int().min(1).max(4).default(3),
    status: z.enum(["waiting", "starting", "in_progress"]),
    gameId: gameIdValue.optional(),
    tournamentId: gameIdValue.optional(),
    tournament: TournamentDataSchema.optional(),
  })
  .strict();

export const SetPlayerAliasSchema = z
  .object({
    tournamentId: gameIdValue,
    alias: z.string().min(1).max(20),
  })
  .strict();

export const JoinTournamentMatchSchema = z
  .object({
    tournamentId: gameIdValue,
    matchId: gameIdValue,
    asLocalHost: z.boolean().optional(),
  })
  .strict();

export const SpectateMatchSchema = z
  .object({
    tournamentId: gameIdValue,
    matchId: gameIdValue,
  })
  .strict();

export const WatchTournamentMatchesSchema = z
  .object({
    tournamentId: gameIdValue,
  })
  .strict();

export const AcceptPongInvitationSchema = z
  .object({
    lobbyId: gameIdValue,
  })
  .strict();

export const PongInvitationNotificationSchema = z
  .object({
    lobbyId: gameIdValue,
    hostId: userIdValue,
    hostUsername: z.string(),
    gameMode: GameModeSchema,
    playerCount: z.coerce.number(),
  })
  .strict();

export const TournamentMatchResultSchema = z
  .object({
    tournamentId: gameIdValue,
    matchId: gameIdValue,
    winnerId: anyPlayerIdValue.nullable(),
    loserId: anyPlayerIdValue.nullable(),
    tournament: TournamentDataSchema,
    nextMatch: TournamentMatchSchema.nullable(),
    isTournamentComplete: z.boolean(),
  })
  .strict();

export type TypeTournamentMatchResult = z.infer<typeof TournamentMatchResultSchema>;

export type TypePlayerDeclaresReadyForGame = z.infer<
  typeof PlayerDeclaresReadyForGame
>;
export type TypePlayerReadyForGameSchema = z.infer<
  typeof PlayerReadyForGameSchema
>;
export type TypeGetGameInfoSchema = z.infer<typeof GetGameInfoSchema>;
export type TypeMovePaddlePayloadScheme = z.infer<
  typeof HandleGameKeysSchema
>;
export type TypeStartNewPongGame = z.infer<typeof StartNewPongGameSchema>;
export type TypeGameStateSchema = z.infer<typeof GameStateSchema>;
export type TypePongWallSchema = z.infer<typeof PongWallSchema>;
export type TypePongPaddle = z.infer<typeof PongPaddleSchema>;
export type TypePongBall = z.infer<typeof PongBallSchema>;
export type TypeCreateLobby = z.infer<typeof CreateLobbySchema>;
export type TypeLobbyData = z.infer<typeof LobbyDataSchema>;
export type TypeTournamentData = z.infer<typeof TournamentDataSchema>;
export type TypeSetPlayerAlias = z.infer<typeof SetPlayerAliasSchema>;
export type TypeJoinTournamentMatch = z.infer<typeof JoinTournamentMatchSchema>;
export type TypeSpectateMatch = z.infer<typeof SpectateMatchSchema>;
export type TypeWatchTournamentMatches = z.infer<typeof WatchTournamentMatchesSchema>;
export type TypeAcceptPongInvitation = z.infer<typeof AcceptPongInvitationSchema>;
export type TypePongInvitationNotification = z.infer<typeof PongInvitationNotificationSchema>;

