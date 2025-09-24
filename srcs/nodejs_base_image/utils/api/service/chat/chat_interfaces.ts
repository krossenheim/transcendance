import { z } from "zod";

export const AddUserToRoomPayloadSchema = z
  .object({
    room_name: z.string(),
    user_to_add: z.number(),
  })
  .strict();

export const SendMessageSchema = z
  .object({
    room_name: z.string(),
    message: z.string(),
  })
  .strict();

const whitelistedPattern = /^[a-zA-Z0-9 ]+$/; 

const alphaNumAndSpaces = z.string()
.min(3, { message: "String must be at least 3 characters long" }).max(50, { message : "Max 50 characters"} )
  .refine((val) => val.replace(/\s/g, "").length >= 3, {
    message: "Must contain at least 3 non-space characters",
  })
  .refine((val) => whitelistedPattern.test(val), {
    message:
      "String contains invalid characters; only alphanumerics are allowed",
  });

export const AddRoomSchema = z
  .object({
    room_name: alphaNumAndSpaces,
  })
  .strict();
