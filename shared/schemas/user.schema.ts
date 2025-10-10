// shared/schemas/user.schema.ts
import { z } from 'zod';

export const UserSchema = z.object({
  id: z.number(),
  username: z.string().min(3).max(20),
  email: z.string().email(),
  avatar: z.string().url().optional(),
});

export type User = z.infer<typeof UserSchema>;