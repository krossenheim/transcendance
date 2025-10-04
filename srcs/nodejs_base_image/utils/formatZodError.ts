import {
  PayloadToUsersSchema,
} from "./api/service/hub/hub_interfaces.js";
import { httpStatus } from "./httpStatusEnum.js";
import type { ZodError } from "zod";
import type { z } from "zod";

type T_PayloadToUsers = z.infer<typeof PayloadToUsersSchema>;

export function formatZodError(
  recipients: number[],
  error: ZodError
): T_PayloadToUsers {
  const formatted: Record<string, string> = {};

  for (const issue of error.issues) {
    const path = issue.path.join(".") || "(root)";
    formatted[path] = issue.message;
  }

  return {
    recipients: recipients,
    funcId: 'TempShit',
    payload: {
      status: httpStatus.UNPROCESSABLE_ENTITY,
      func_name: process.env.FUNC_POPUP_TEXT,
      pop_up_text: formatted,
    },
  };
}