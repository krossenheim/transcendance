import { room_id_rule, room_name_rule, message_rule } from "./chat_interfaces.js";
import { idValue } from "../common/zodRules.js";
import { z } from "zod";

const message_date_rule = z.number().int().gte(0);

export const StoredMessageSchema = z
  .object({
	// Shape of 'message' fo rht eclient'
	message_id: idValue,
    room_id: room_id_rule,
    messageString: message_rule,
    messageDate: message_date_rule,
    userId: idValue,
  })
  .strict();

export const RoomMessagesSchema = z
  .object({
    room_id: room_id_rule,
	  messages: z.array(StoredMessageSchema),
  })
  .strict();

export const GetUsersInRoomSchema = z
  .object({
    roomName: room_name_rule,
    room_id: room_id_rule,
	messages: z.array(StoredMessageSchema),
	users: z.array(idValue),
  })
  .strict();

export const RoomSchema = z.object(
	{    room_id: room_id_rule,
    room_name: room_name_rule,}
).strict();

export const ListRoomsSchema = z
  .array(RoomSchema);


  export type TypeStoredMessageSchema = z.infer<typeof StoredMessageSchema>;
  export type TypeRoomMessagesSchema = z.infer<typeof RoomMessagesSchema>;
  export type TypeListRoomsSchema = z.infer<typeof ListRoomsSchema>;
  export type TypeRoomSchema = z.infer<typeof RoomSchema>;
