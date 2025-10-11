import { userIdValue } from '../common/zodRules.js';
import { z } from 'zod';

export const VerifyTokenPayload = z.object({
  token: z.string(),
}).strict();

export const StoreTokenPayload = z.object({
  userId: userIdValue,
  token: z.string(),
}).strict();

export type StoreTokenPayloadType = z.infer<typeof StoreTokenPayload>;
export type VerifyTokenPayloadType = z.infer<typeof VerifyTokenPayload>;

export default {
  VerifyTokenPayload,
  StoreTokenPayload
};