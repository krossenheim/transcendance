import { z } from "zod";

const NAME_MIN_LENTH = 3;
const NAME_MAX_LENGTH = 50;

const whitelistedPattern = /^[a-zA-Z0-9 ]+$/;

const roomNameRule = z
  .coerce.string()
  .min(NAME_MIN_LENTH, {
    message: `String must be at least ${NAME_MIN_LENTH} characters long`,
  })
  .max(NAME_MAX_LENGTH, { message: `Max ${NAME_MAX_LENGTH} characters` })
  .refine((val) => val.replace(/\s/g, ``).length >= NAME_MIN_LENTH, {
    message: `Must contain at least ${NAME_MIN_LENTH} non-space characters`,
  })
  .refine((val) => whitelistedPattern.test(val), {
    message: `String contains invalid characters; only alphanumerics are allowed`,
  });

const MESSAGE_MIN_LENTH = 1;
const MESSAGE_LENGTH = 320;

const messageRule = z
  .coerce.string()
  .min(MESSAGE_MIN_LENTH, {
    message: `String must be at least ${MESSAGE_MIN_LENTH} characters long`,
  })
  .max(MESSAGE_LENGTH, { message: `Max ${MESSAGE_LENGTH} characters` })
  .refine((val) => val.replace(/\s/g, ``).length >= MESSAGE_MIN_LENTH, {
    message: `Must contain at least ${MESSAGE_MIN_LENTH} non-space characters`,
  })
  .refine((val) => whitelistedPattern.test(val), {
    message: `String contains invalid characters; only alphanumerics are allowed`,
  });

export const AddUserToRoomPayloadSchema = z
  .object({
    room_name: roomNameRule,
    user_to_add: z.number().int().positive(),
  })
  .strict();

export const SendMessageSchema = z
  .object({
    room_name: roomNameRule,
    message: messageRule,
  })
  .strict();

export const AddRoomSchema = z
  .object({
    room_name: roomNameRule,
  })
  .strict();
