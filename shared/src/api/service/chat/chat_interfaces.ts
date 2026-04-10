import { idValue, userIdentifierValue } from "@app/shared/api/service/common/zodRules";
import { z } from "zod";

export const ROOMNAME_MAX_LEN = 50;

export enum ChatRoomType {
  PRIVATE = 1,
  DIRECT_MESSAGE = 2
};

export const room_id_rule = z.coerce.number().gt(0);
export const room_name_rule = z.coerce
  .string()
  .max(ROOMNAME_MAX_LEN, { message: `Max ${ROOMNAME_MAX_LEN} characters` })

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


export const AddRoomPayloadSchema = z
  .object({
    roomName: room_name_rule
  })
  .strict();

export const SendMessagePayloadSchema = z
  .object({
    roomId: room_id_rule,
    messageString: message_rule,
  })
  .strict();

export const SendDMMessagePayloadSchema = z
  .object({
    targetUserId: idValue,
    messageString: message_rule,
  })
  .strict();

export const AddToRoomPayloadSchema = z
  .object({
    roomId: room_id_rule,
    user_to_add: userIdentifierValue,
  })
  .strict();

export const RequestRoomByIdSchema = z
  .object({
    roomId: room_id_rule,
  })
  .strict();

export const EmptySchema = z.object({}).strict();

export type TypeRequestRoomByIdSchema = z.infer<typeof RequestRoomByIdSchema>;
export type TypeEmptySchema = z.infer<typeof EmptySchema>;
export type TypeAddRoomPayloadSchema = z.infer<typeof AddRoomPayloadSchema>;
export type TypeAddToRoomPayload = z.infer<typeof AddToRoomPayloadSchema>;
export type TypeUserSendMessagePayload = z.infer<
  typeof SendMessagePayloadSchema
>;

