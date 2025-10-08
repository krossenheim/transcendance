import { z } from "zod";
import { id_rule } from "../db/user.js";

const whitelistedPattern = /^[a-zA-Z0-9 ]+$/;
const ROOMNAME_MIN_LEN = 3;
export const ROOMNAME_MAX_LEN = 50;

export const room_id_rule = z.number().gt(0);
export const room_name_rule = z.coerce
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

export const message_rule = z.coerce
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

export const RoomNamePayloadSchema = z
  .object({
    room_name: room_name_rule,
  })
  .strict();

export const SendMessagePayloadSchema = z
  .object({
    room_id: room_id_rule,
    messageString: message_rule,
  })
  .strict();

export const AddToRoomPayloadSchema = z
  .object({
    room_name: RoomNamePayloadSchema,
    user_to_add: id_rule,
  })
  .strict();

export type TypeRoomNamePayload = z.infer<typeof RoomNamePayloadSchema>;
export type TypeAddToRoomPayload = z.infer<typeof AddToRoomPayloadSchema>;
export type TypeUserSendMessagePayload = z.infer<
  typeof SendMessagePayloadSchema
>;
