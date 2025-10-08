import { z } from "zod";
import { GetUser, id_rule } from "../db/user.js";
import { room_id_rule, room_name_rule, message_rule } from "./chat_interfaces.js";

const message_date_rule = z.number().int();

export const StoredMessageSchema = z
  .object({
    roomName: room_name_rule,
    room_id: room_id_rule,
    messageString: message_rule,
    messageDate: message_date_rule,
    userId: id_rule,
  })
  .strict();

export const StoredRoomSchema = z
  .object({
    roomName: room_name_rule,
    room_id: room_id_rule,
    users: z.array(GetUser),
    whitelist: z.array(GetUser),
  })
  .strict();

export type TypeStoredMessageSchema = z.infer<typeof StoredMessageSchema>;
export type TypeStoredRoomSchema = z.infer<typeof StoredRoomSchema>;
