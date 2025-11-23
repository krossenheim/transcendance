import {
  room_id_rule,
  room_name_rule,
  message_rule,
  ChatRoomType,
} from "./chat_interfaces.js";
import { idValue, userIdValue } from "../common/zodRules.js";
import { PublicUserData } from "../db/user.js";
import { z } from "zod";

export const message_date_rule = z.number().int().gte(0);

export enum ChatRoomUserAccessType {
  INVITED = 0,
  JOINED = 1,
};

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

export const RoomSchema = z
  .object({
    roomName: room_name_rule,
    roomId: room_id_rule,
    roomType: z.enum(ChatRoomType),
  })
  .strict();
export type TypeRoomSchema = z.infer<typeof RoomSchema>;

export const RoomUserConnectionSchema = z.object({
  userId: userIdValue,
  userState: z.enum(ChatRoomUserAccessType),
}).strict();
export type TypeRoomUserConnectionSchema = z.infer<typeof RoomUserConnectionSchema>;

export const FullRoomInfoSchema = z
  .object({
    room: RoomSchema,
    messages: z.array(StoredMessageSchema),
    userConnections: z.array(RoomUserConnectionSchema),
    users: z.array(PublicUserData),
  })
  .strict();
export type TypeFullRoomInfoSchema = z.infer<typeof FullRoomInfoSchema>;

export const RoomEventSchema = z
  .object({
    user: idValue,
    roomId: room_id_rule,
  })
  .strict();

export const ListRoomsSchema = z.array(RoomSchema);
export type TypeListRoomsSchema = z.infer<typeof ListRoomsSchema>;

export const DMCreatedResponseSchema = z
  .object({
    roomId: room_id_rule,
  })
  .strict();
export type TypeDMCreatedResponseSchema = z.infer<typeof DMCreatedResponseSchema>;