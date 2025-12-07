import { userIdValue } from "@app/shared/api/service/common/zodRules";
import { z, ZodType } from "zod";

export const GenericAuthClientRequest = z.object({
  userId: userIdValue,
  payload: z.any().optional()
}).strict();

export function AuthClientRequest<T extends ZodType>(payloadSchema: T) {
  return GenericAuthClientRequest.extend({
    payload: payloadSchema,
  }).strict();
}

export type AuthClientRequestType<T extends ZodType> = z.infer<
  ReturnType<typeof AuthClientRequest<T>>
>;
