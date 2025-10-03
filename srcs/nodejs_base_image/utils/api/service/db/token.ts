import { z } from 'zod';

export const VerifyTokenPayload = z.object({
  userId: z.number().min(1),
  token: z.string(),
}).strict();

export type VerifyTokenPayloadType = z.infer<typeof VerifyTokenPayload>;

export default {
  VerifyTokenPayload
};