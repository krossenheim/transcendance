import {
  room_id_rule,
  room_name_rule,
  message_rule,
} from "./chat_interfaces.js";
import { idValue } from "../common/zodRules.js";
import { z } from "zod";

export const message_date_rule = z.number().int().gte(0);

export const StoredMessageSchema = z
  .object({
    messageId: idValue,
    roomId: room_id_rule,
    messageString: message_rule,
    messageDate: message_date_rule,
    userId: idValue,
  })
  .strict();
export type TypeStoredMessageSchema = z.infer<typeof StoredMessageSchema>;

export const RoomMessagesSchema = z
  .object({
    roomId: room_id_rule,
    messages: z.array(StoredMessageSchema),
  })
  .strict();
export type TypeRoomMessagesSchema = z.infer<typeof RoomMessagesSchema>;

export const FullRoomInfoSchema = z
  .object({
    roomName: room_name_rule,
    roomId: room_id_rule,
    messages: z.array(StoredMessageSchema),
    users: z.array(idValue),
  })
  .strict();
export type TypeFullRoomInfoSchema = z.infer<typeof FullRoomInfoSchema>;

export const RoomSchema = z
  .object({
    roomName: room_name_rule,
    roomId: room_id_rule,
  })
  .strict();

export const RoomEventSchema = z
  .object({
    user: idValue,
    roomId: room_id_rule,
  })
  .strict();

export type TypeRoomSchema = z.infer<typeof RoomSchema>;

export const ListRoomsSchema = z.array(RoomSchema);
export type TypeListRoomsSchema = z.infer<typeof ListRoomsSchema>;
