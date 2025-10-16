import { z } from "zod";

export const UserAuthenticationRequestSchema = z
  .object({
    authorization: z.string(),
  })
  .strict();

export const UserToHubSchema = z
  .object({
    target_container: z.string(),
    funcId: z.string(),
    payload: z.any(),
  })
  .strict();

export const PayloadToUsersSchema = z
  .object({
    recipients: z
      .array(z.number())
      .nonempty({ message: "Recipients array cannot be empty" }),
    funcId: z.string(),
    payload: z.any(),
    // code: z.number(),
    // big? todo
  })
  .strict();

export const PayloadHubToUsersSchema = z
  .object({
    source_container: z.string(),
    funcId: z.string(),
    // code: z.number(),
    payload: z.any(),
  })
  .strict();

export const ForwardToContainerSchema = z
  .object({
    user_id: z.number(),
    funcId: z.string(),
    payload: z.any(),
  })
  .strict();

export type TypePayloadHubToUsersSchema = z.infer<typeof PayloadHubToUsersSchema>;
export type T_ForwardToContainer = z.infer<typeof ForwardToContainerSchema>;
export type T_PayloadToUsers = z.infer<typeof PayloadToUsersSchema>;