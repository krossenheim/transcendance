import {
  ForwardToContainerSchema,
  PayloadToUsersSchema,
} from "./utils/api/service/hub/hub_interfaces.js";
import type {
  T_ForwardToContainer,
  T_PayloadToUsers,
} from "./utils/api/service/hub/hub_interfaces.js";
import {
  AddRoomPayloadSchema,
  AddToRoomPayloadSchema,
  room_id_rule,
  SendMessagePayloadSchema,
  type TypeAddRoomPayloadSchema,
  type TypeAddToRoomPayload,
  type TypeRequestRoomByIdSchema,
  type TypeUserSendMessagePayload,
} from "./utils/api/service/chat/chat_interfaces.js";
import httpStatus from "./utils/httpStatusEnum.js";
import { date, z } from "zod";
import Containers from "./utils/internal_api.js";
import { int_url } from "./utils/api/service/common/endpoints.js";
import type { ErrorResponseType } from "./utils/api/service/common/error.js";
import {
  StoredMessageSchema,
  RoomEvents,
  type TypeRoomSchema,
  type TypeStoredMessageSchema,
} from "./utils/api/service/chat/db_models.js";
import { message_date_rule } from "./utils/api/service/chat/db_models.js";
import { Result } from "./utils/api/service/common/result.js";
import { idValue } from "./utils/api/service/common/zodRules.js";

function toInt(value: string) {
  const num = Number(value);
  if (!Number.isInteger(num)) {
    throw new TypeError(`Cannot convert "${value}" to integer`);
  }
  return num;
}

class FixedSizeList<T> {
  public list: Array<T>;
  public maxSize: number;
  constructor(maxSize = 10) {
    this.maxSize = maxSize;
    this.list = [];
  }

  add(item: T) {
    this.list.push(item);

    if (this.list.length > this.maxSize) {
      this.list.shift();
    }
  }

  getList() {
    return this.list;
  }
}

class Room {
  public room_name: string;
  public readonly roomId: number;
  public users: Array<number>;
  public messages: FixedSizeList<TypeStoredMessageSchema>;
  public allowedUsers: Array<any>;
  public readonly max_messages: number;
  private _current_message_id: number = 0; // Get from db on init as well as the last X stored messages

  constructor(room_name: string, roomId: number) {
    this.roomId = roomId;
    this.room_name = room_name;
    this.users = new Array();
    this.max_messages = 20;
    this.messages = new FixedSizeList(this.max_messages);
    this.allowedUsers = new Array();
    this._current_message_id = 1; // Get from db as well as the last max_messages stored messages
  }

  //////
  removeUser(user: any) {
    this.users = this.users.filter((u) => u !== user);
  }

  sendMessage(
    client_input: TypeUserSendMessagePayload,
    client_metadata: T_ForwardToContainer
  ): Result<T_PayloadToUsers, ErrorResponseType> {
    if (
      client_input.roomId !== this.roomId ||
      this.users.indexOf(client_metadata.user_id) === -1
    ) {
      return Result.Ok({
        recipients: [client_metadata.user_id],
        funcId: client_metadata.funcId,
        payload: {
          message: `No such room (ID: ${client_input.roomId}) or you are not in it.`,
        },
      });
    }
    if (!client_input.messageString) {
      Result.Err("Received no message body");
    }
    const message = {
      messageId: this._current_message_id++,
      roomId: this.roomId,
      messageString: client_input.messageString,
      messageDate: Date.now(),
      userId: client_metadata.user_id,
    };
    this.messages.add(message);
    return Result.Ok({
      recipients: this.users,
      funcId: client_metadata.funcId,
      payload: message,
    });
  }

  addToRoom(
    client_input: TypeAddToRoomPayload,
    client_metadata: T_ForwardToContainer
  ): Result<T_PayloadToUsers, ErrorResponseType> {
    if (this.allowedUsers.indexOf(client_metadata.user_id) === -1) {
      return Result.Ok({
        recipients: [client_metadata.user_id],
        funcId: client_metadata.funcId,
        payload: {
          message: `Can't add users to a room you are not in.`,
        },
      });
    }
    if (this.roomId !== client_input.roomId) {
      return Result.Err({
        message: `Rooms handler incorrectly forwarded room ${this.roomId} a request for room ${client_input.roomId}`,
      });
    }
    if (this.allowedUsers.indexOf(client_input.user_to_add) !== -1) {
      return Result.Ok({
        recipients: [client_metadata.user_id],
        funcId: client_metadata.funcId,
        payload: {
          user: client_input.user_to_add,
          event: RoomEvents.ALREADY_IN_ROOM,
          roomId: this.roomId,
        },
      });
    }
    this.allowedUsers.push(client_input.user_to_add);
    return Result.Ok({
      recipients: [client_metadata.user_id, client_input.user_to_add],
      funcId: client_metadata.funcId,
      payload: {
        user: client_input.user_to_add,
        event: RoomEvents.ADDED_TO_ROOM,
        roomId: this.roomId,
      },
    });
  }

  equals(otherRoom: Room) {
    return otherRoom && this.roomId == otherRoom.roomId;
  }
}

let DEBUGROOMID = 1;
class ChatRooms {
  private rooms: Array<Room>;
  public static instance: ChatRooms;

  constructor() {
    this.rooms = new Array();

    if (ChatRooms.instance) {
      return ChatRooms.instance;
    }
    ChatRooms.instance = this;

    return this;
  }

  getRoom(roomId: number): Room | null {
    const room = this.rooms.find((room) => room.roomId === roomId);
    if (room === undefined) return null;
    return room;
  }

  addRoom(
    client_input: TypeAddRoomPayloadSchema,
    client_metadata: T_ForwardToContainer
  ): Result<T_PayloadToUsers, ErrorResponseType> {
    const newroom = new Room(client_input.roomName, DEBUGROOMID++);
    newroom.users.push(client_metadata.user_id);
    newroom.allowedUsers.push(client_metadata.user_id);
    this.rooms.push(newroom);
    return Result.Ok({
      recipients: [client_metadata.user_id],
      funcId: client_metadata.funcId,
      payload: {
        roomId: newroom.roomId,
        roomName: newroom.room_name,
      },
    });
  }

  listRooms(
    client_metadata: T_ForwardToContainer
  ): Result<T_PayloadToUsers, ErrorResponseType> {
    const list: Array<TypeRoomSchema> = [];

    for (const room of this.rooms) {
      if (room.users.find((id) => id === client_metadata.user_id)) {
        list.push({ roomName: room.room_name, roomId: room.roomId });
      }
    }
    console.log(`User ${client_metadata.user_id} sent list of rooms:${list}.`);

    return Result.Ok({
      recipients: [client_metadata.user_id],
      funcId: client_metadata.funcId,
      payload: list,
    });
  }

  userJoinRoom(
    body: TypeRequestRoomByIdSchema,
    client_metadata: T_ForwardToContainer
  ): Result<T_PayloadToUsers, ErrorResponseType> {
    const room = this.getRoom(body.roomId);
    if (room === null) {
      return Result.Ok({
        recipients: [client_metadata.user_id],
        funcId: client_metadata.funcId,
        payload: {
          message: `No such room (ID: ${body.roomId}) or you are not in it.`,
        },
      });
    }
    if (room.allowedUsers.find((id) => id === client_metadata.user_id)) {
      if (room.users.find((id) => id === client_metadata.user_id)) {
        return Result.Ok({
          recipients: [client_metadata.user_id],
          funcId: client_metadata.funcId,
          payload: {
            user: client_metadata.user_id,
            event: RoomEvents.ALREADY_IN_ROOM,
            roomId: room.roomId,
          },
        });
      }
      room.users.push(client_metadata.user_id);
      console.log(
        `User ${client_metadata.user_id} joined room ${room.roomId}.`
      );
      return Result.Ok({
        recipients: room.users,
        funcId: client_metadata.funcId,
        payload: {
          user: client_metadata.user_id,
          event: RoomEvents.JOINED,
          roomId: room.roomId,
        },
      });
    }
    return Result.Ok({
      recipients: [client_metadata.user_id],
      funcId: client_metadata.funcId,
      payload: {
        message: `No such room (ID: ${body.roomId}) or you are not in it.`,
      },
    });
  }
}

export default ChatRooms;
