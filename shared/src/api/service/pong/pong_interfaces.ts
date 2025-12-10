import { z } from "zod";
import { gameIdValue, userIdValue } from "@app/shared/api/service/common/zodRules";

const player_list_rule = z.array(z.coerce.number()).refine(
  (arr) => {
    // Count occurrences of each ID
    const counts = arr.reduce<Record<number, number>>((acc, id) => {
      acc[id] = (acc[id] || 0) + 1;
      return acc;
    }, {});

    // Ensure no ID appears more than twice
    return Object.values(counts).every((count) => count <= 2);
  },
  {
    message: "N omore than 2 player IDS in a given pong game.",
  }
);

export const PongBallSchema = z
  .tuple([
    z.coerce.number(), // x
    z.coerce.number(), // y
    z.coerce.number(), // velocity x
    z.coerce.number(), // velocity y
    z.coerce.number(), // radius
    z.coerce.number(), // inverse mass
  ]);

export const PongPaddleSchema = z
  .tuple([
    z.coerce.number(), // center x
    z.coerce.number(), // center y
    z.coerce.number(), // angle
    z.coerce.number(), // width
    z.coerce.number(), // height
    z.coerce.number(), // velocity x
    z.coerce.number(), // velocity y
    z.coerce.number(), // player id
  ]);

const PongWallSchema = z
  .tuple([
    z.coerce.number(), // pointA x
    z.coerce.number(), // pointA y
    z.coerce.number(), // pointB x
    z.coerce.number(), // pointB y
    z.coerce.number(), // velocity x
    z.coerce.number(), // velocity y
    z.coerce.number().nullable(), // player id or null
  ]);

export const UserGameConfigSchema = z.object({
  ballSpeed: z.coerce.number().int().gt(100).lt(1000).optional().nullable(),
  paddleSpeedFactor: z.coerce.number().gt(0.1).lt(10.0).optional().nullable(),
  paddleWidthFactor: z.coerce.number().gt(0.01).lt(0.9).optional().nullable(),
  powerupFrequency: z.coerce.number().gt(0).optional().nullable(),
  gameDuration: z.coerce.number().gt(30).lt(600).optional().nullable()
}).strict();

export const StartNewPongGameSchema = z
  .object({
    balls: z.coerce.number().int().gt(0).lt(1000),
    player_list: player_list_rule,
    gameConfig: UserGameConfigSchema.optional().nullable(),
  })
  .strict();

export const HandleGameKeysSchema = z
  .object({
    board_id: gameIdValue, // board id
    pressed_keys: z.array(z.string()), // pressed keys
  })
  .strict();

export const GameStateSchema = z
  .object({
    board_id: gameIdValue,
    balls: z.array(PongBallSchema),
    paddles: z.array(PongPaddleSchema),
    walls: z.array(PongWallSchema),
  })
  .strict();

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

// Lobby and Tournament schemas
export const GameModeSchema = z.enum(["1v1", "multiplayer", "tournament_1v1", "tournament_multi"]);

export const CreateLobbySchema = z
  .object({
    gameMode: GameModeSchema,
    playerIds: z.array(userIdValue),
    playerUsernames: z.record(z.string(), z.string()).optional(),
    gameConfig: UserGameConfigSchema.optional().nullable(),
  })
  .strict();

export const LobbyPlayerSchema = z
  .object({
    userId: userIdValue,
    username: z.string(),
    isReady: z.boolean(),
    isHost: z.boolean(),
  })
  .strict();

export const TournamentPlayerSchema = z
  .object({
    userId: userIdValue,
    username: z.string(),
    alias: z.string().optional(),
  })
  .strict();

export const TournamentMatchSchema = z
  .object({
    matchId: gameIdValue,
    round: z.coerce.number().int().min(1),
    player1Id: userIdValue.nullable(),
    player2Id: userIdValue.nullable(),
    winnerId: userIdValue.nullable(),
    status: z.enum(["pending", "in_progress", "completed"]),
  })
  .strict();

export const TournamentDataSchema = z
  .object({
    tournamentId: gameIdValue,
    name: z.string(),
    mode: z.enum(["tournament_1v1", "tournament_multi"]),
    players: z.array(TournamentPlayerSchema),
    matches: z.array(TournamentMatchSchema),
    currentRound: z.coerce.number().int().min(1),
    totalRounds: z.coerce.number().int().min(1),
    status: z.enum(["registration", "in_progress", "completed"]),
    winnerId: userIdValue.nullable(),
    gameConfig: UserGameConfigSchema.optional().nullable(),
    onchainTxHashes: z.array(z.string()).optional(),
  })
  .strict();

export const LobbyDataSchema = z
  .object({
    lobbyId: gameIdValue,
    gameMode: GameModeSchema,
    players: z.array(LobbyPlayerSchema),
    gameConfig: UserGameConfigSchema.optional().nullable(),
    status: z.enum(["waiting", "starting", "in_progress"]),
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
export type TypeUserGameConfigSchema = z.infer<typeof UserGameConfigSchema>;
export type TypeTournamentData = z.infer<typeof TournamentDataSchema>;
export type TypeSetPlayerAlias = z.infer<typeof SetPlayerAliasSchema>;
export type TypeJoinTournamentMatch = z.infer<typeof JoinTournamentMatchSchema>;
export type TypeAcceptPongInvitation = z.infer<typeof AcceptPongInvitationSchema>;
export type TypePongInvitationNotification = z.infer<typeof PongInvitationNotificationSchema>;
