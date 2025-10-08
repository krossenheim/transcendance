import { z } from "zod";

const ROOMNAME_MIN_LEN = 3;
export const ROOMNAME_MAX_LEN = 50;

const whitelistedPattern = /^[a-zA-Z0-9 ]+$/;

const roomNameRule = z.coerce
  .string()
  .min(ROOMNAME_MIN_LEN, {
    message: `String must be at least ${ROOMNAME_MIN_LEN} characters long`,
  })
  .max(ROOMNAME_MAX_LEN, { message: `Max ${ROOMNAME_MAX_LEN} characters` })
  .refine((val) => val.replace(/\s/g, ``).length >= ROOMNAME_MIN_LEN, {
    message: `Must contain at least ${ROOMNAME_MIN_LEN} non-space characters`,
  })
  .refine((val) => whitelistedPattern.test(val), {
    message: `String contains invalid characters; only alphanumerics are allowed`,
  });

const MESSAGE_MIN_LEN = 1;
export const MESSAGE_MAX_LEN = 320;

const messageRule = z.coerce
  .string()
  .min(MESSAGE_MIN_LEN, {
    message: `String must be at least ${MESSAGE_MIN_LEN} characters long`,
  })
  .max(MESSAGE_MAX_LEN, { message: `Max ${MESSAGE_MAX_LEN} characters` })
  .refine((val) => val.replace(/\s/g, ``).length >= MESSAGE_MIN_LEN, {
    message: `Must contain at least ${MESSAGE_MIN_LEN} non-space characters`,
  })
  .refine((val) => whitelistedPattern.test(val), {
    message: `String contains invalid characters; only alphanumerics are allowed`,
  });

export const StoredMessageSchema = z
  .object({
    userId: z.number().int().positive(),
    roomName: roomNameRule,
    messageString: messageRule,
    messageDate: z.number().int(),
  })
  .strict();

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
