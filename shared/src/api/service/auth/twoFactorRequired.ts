import { z } from 'zod';

export const TwoFactorRequiredResponse = z.object({
  requires2FA: z.literal(true),
  userId: z.number(),
  tempToken: z.string(),
});

export type TwoFactorRequiredResponseType = z.infer<typeof TwoFactorRequiredResponse>;
