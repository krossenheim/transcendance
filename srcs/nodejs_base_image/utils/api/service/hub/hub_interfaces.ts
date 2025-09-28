import { z } from "zod";
import { containersNameToIp } from "../../../container_names.js"

const allowedEndpoints = ["/api/", "/api/public/"];
const allowedContainerNames = Array.from(containersNameToIp.keys());

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
	target_container: z
      .string()
      .refine(
        (val) => allowedContainerNames.some((prefix) => val.startsWith(prefix)),
        {
          message: `endpoint must be one of: ${allowedContainerNames.join(", ")}`,
        }
      ),
  })
  .strict();

export const PayloadToUsersSchema = z
  .object({
      recipients: z.array(z.number())
    .nonempty({ message: "Recipients array cannot be empty" }),
    payload: z.any(),
	endpoint: z.string(),
  })
  .strict();

export const ForwardToContainerSchema = z
  .object({
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
