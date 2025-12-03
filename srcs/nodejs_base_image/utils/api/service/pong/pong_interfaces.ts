import { z } from "zod";
import { gameIdValue, userIdValue } from "../common/zodRules.js";

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
export const StartNewPongGameSchema = z
  .object({
    balls: z.coerce.number().int().gt(0).lt(1000),
    player_list: player_list_rule,
  })
  .strict();

export const PongBallSchema = z
  .object({
    id: z.coerce.number(),
    x: z.coerce.number(),
    y: z.coerce.number(),
    dx: z.coerce.number().min(-1).max(1),
    dy: z.coerce.number().min(-1).max(1),
  })
  .strict();

export const PongPaddleSchema = z
  .object({
    x: z.coerce.number(),
    y: z.coerce.number(),
    l: z.coerce.number().gt(0),
    w: z.coerce.number().gt(0),
    r: z.coerce.number(),
    paddle_id: gameIdValue, // paddle id
    owner_id: userIdValue, 
  })
  .strict();

const PongEdgeSchema = z
  .object({
    x: z.coerce.number(),
    y: z.coerce.number(),
  })
  .strict();

export const MovePaddlePayloadScheme = z
  .object({
    board_id: gameIdValue, // board id
    paddle_id: gameIdValue, // paddle id
    m: z.union([z.boolean(), z.null()]), // move right = yyes , left = no, not = null
  })
  .strict();

export const GameStateSchema = z
  .object({
    board_id: gameIdValue,
    balls: z.array(PongBallSchema),
    paddles: z.array(PongPaddleSchema),
    edges: z.array(PongEdgeSchema),
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
    ballCount: z.coerce.number().int().min(1).max(5),
    maxScore: z.coerce.number().int().min(3).max(21),
    allowPowerups: z.boolean().optional().default(false),
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

export const LobbyDataSchema = z
  .object({
    lobbyId: gameIdValue,
    gameMode: GameModeSchema,
    players: z.array(LobbyPlayerSchema),
    // Optional canonical tournament object attached by the server when the lobby
    // represents a tournament. Use a lazy reference so ordering of declarations
    // doesn't cause runtime reference errors in compiled JS.
    tournament: z.lazy(() => TournamentDataSchema).optional(),
    ballCount: z.coerce.number(),
    maxScore: z.coerce.number(),
    allowPowerups: z.boolean(),
    status: z.enum(["waiting", "starting", "in_progress"]),
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
    // Metadata about the underlying pong matches the tournament will run
    // over so the frontend has the necessary parameters for matches.
    ballCount: z.coerce.number().optional(),
    maxScore: z.coerce.number().optional(),
    // On-chain transaction hashes recorded for completed matches/scores
    onchainTxHashes: z.array(z.string()).optional(),
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
  typeof MovePaddlePayloadScheme
>;
export type TypeStartNewPongGame = z.infer<typeof StartNewPongGameSchema>;
export type TypeGameStateSchema = z.infer<typeof GameStateSchema>;
export type TypePongEdgeSchema = z.infer<typeof PongEdgeSchema>;
export type TypePongPaddle = z.infer<typeof PongPaddleSchema>;
export type TypePongBall = z.infer<typeof PongBallSchema>;
export type TypeCreateLobby = z.infer<typeof CreateLobbySchema>;
export type TypeLobbyData = z.infer<typeof LobbyDataSchema>;
export type TypeTournamentData = z.infer<typeof TournamentDataSchema>;
export type TypeSetPlayerAlias = z.infer<typeof SetPlayerAliasSchema>;
export type TypeJoinTournamentMatch = z.infer<typeof JoinTournamentMatchSchema>;
export type TypeAcceptPongInvitation = z.infer<typeof AcceptPongInvitationSchema>;
export type TypePongInvitationNotification = z.infer<typeof PongInvitationNotificationSchema>;
