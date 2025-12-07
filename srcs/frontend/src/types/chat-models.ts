// Frontend chat model facades
import {
  TypeStoredMessageSchema,
  TypeRoomSchema,
  TypeFullRoomInfoSchema,
  TypeListRoomsSchema,
} from "../../../../shared/src/api/service/chat/db_models";

export interface TypeRoomMessagesSchema {
  roomId: number;
  messages: TypeStoredMessageSchema[];
}

export type { TypeStoredMessageSchema, TypeRoomSchema, TypeFullRoomInfoSchema, TypeListRoomsSchema };
