// Frontend chat model facades
import {
  TypeStoredMessageSchema,
  TypeRoomSchema,
  TypeFullRoomInfoSchema,
  TypeListRoomsSchema,
} from "../../../nodejs_base_image/utils/api/service/chat/db_models";

export interface TypeRoomMessagesSchema {
  roomId: number;
  messages: TypeStoredMessageSchema[];
}

export type { TypeStoredMessageSchema, TypeRoomSchema, TypeFullRoomInfoSchema, TypeListRoomsSchema };
