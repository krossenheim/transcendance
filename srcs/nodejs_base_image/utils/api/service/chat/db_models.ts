import { z } from "zod";
import { GetUser, id_rule } from "../db/user.js";
import { room_id_rule, room_name_rule, message_rule } from "./chat_interfaces.js";

const message_date_rule = z.number().int().gte(0);

export const StoredMessageSchema = z
  .object({
	// Shape of 'message' fo rht eclient'
	  message_id: id_rule,
    room_id: room_id_rule,
    messageString: message_rule,
    messageDate: message_date_rule,
    userId: id_rule,
  })
  .strict();

export const RoomMessagesSchema = z
  .object({
    room_id: room_id_rule,
	  messages: z.array(StoredMessageSchema),
  })
  .strict();


export const ListRoomsSchema = z
  .array(z.object({
	// To client when asnwering 'Give my list of rooms' 
	// chat validates user in z.users (No field for user id here, its set by hub)
    room_id: room_id_rule,
    room_name: room_name_rule,
  }).strict());


export type TypeRoomMessagesSchema = z.infer<typeof RoomMessagesSchema>;
export type TypeStoredMessageSchema = z.infer<typeof StoredMessageSchema>;
export type TypeListRoomsSchema = z.infer<typeof ListRoomsSchema>;
