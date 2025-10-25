import { z } from "zod";
import { gameIdValue, userIdValue } from "../common/zodRules.js";

export const StartNewPongGameSchema = z
  .object({
    balls: z.coerce.number().int().gt(0).lt(1000),
    player_list: z.array(z.coerce.number()).refine(
      (arr) => {
        // Check uniqueness
        return new Set(arr).size === arr.length;
      },
      {
        message: "playerList must contain unique numbers",
      }
    ),
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
    board_id: gameIdValue, //board id
    m: z.union([z.boolean(), z.null()]), // move right = yyes , left = no, not = null
  })
  .strict();

export const GameStateSchema = z
  .object({
    game_id: gameIdValue,
    balls: z.array(PongBallSchema),
    paddles: z.array(PongPaddleSchema),
    edges: z.array(PongEdgeSchema),
  })
  .strict();

export const GetGameInfoSchema = z
  .object({
    game_id: gameIdValue,
    player_list: z.array(z.coerce.number()).refine(
      (arr) => {
        // Check uniqueness
        return new Set(arr).size === arr.length;
      },
      {
        message: "playerList must contain unique numbers",
      }
    ),
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
