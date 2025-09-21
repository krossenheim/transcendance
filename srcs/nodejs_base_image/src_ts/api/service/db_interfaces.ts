import { z } from 'zod';

const GameResultSchema = z.object({
  id: z.number(),
  userId: z.number(),
  score: z.number(),
  rank: z.number(),
});

const UserSchema = z.object({
    id: z.number(),
    createdAt: z.number(),
    username: z.string(),
    email: z.string(),
});

const FullUserSchema = UserSchema.extend({
    gameResults: z.array(GameResultSchema),
});

export default {
    GameResultSchema,
    UserSchema,
    FullUserSchema,
};