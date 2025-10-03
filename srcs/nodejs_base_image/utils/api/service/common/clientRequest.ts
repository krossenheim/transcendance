import { z, ZodType } from "zod";

export const GenericAuthClientRequest = z.object({
  userId: z.number().min(1),
  payload: z.any().nullable()
}).strict();

export function AuthClientRequest<T extends ZodType>(payloadSchema: T) {
  return GenericAuthClientRequest.extend({
    payload: payloadSchema,
  }).strict();
}

export type AuthClientRequestType<T extends ZodType> = z.infer<
  ReturnType<typeof AuthClientRequest<T>>
>;
