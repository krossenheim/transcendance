import { z } from "zod";

const allowedEndpoints = ["/api/", "/api/public/"];

export const UserRequestSchema = z
  .object({
    endpoint: z
      .string()
      .refine(
        (val) => allowedEndpoints.some((prefix) => val.startsWith(prefix)),
        {
          message: `endpoint must be one of: ${allowedEndpoints.join(", ")}`,
        }
      ),
    payload: z.any(),
  })
  .strict();

export const UserAuthenticationRequestSchema = z
  .object({
    authorization: z.string(),
  })
  .strict();

export const PayloadToUsersSchema = z
  .object({
      recipients: z.array(z.number())
    .nonempty({ message: "Recipients array cannot be empty" }),
    payload: z.any(),
  })
  .strict();

export const ForwardToContainerSchema = z
  .object({
    target_container: z.string(),
    user_id: z.number(),
    endpoint: z
      .string()
      .refine(
        (val) => allowedEndpoints.some((prefix) => val.startsWith(prefix)),
        {
          message: `endpoint must be one of: ${allowedEndpoints.join(", ")}`,
        }
      ),
    payload: z.any(), //!!! fill in all schemas?? 
  })
  .strict();
