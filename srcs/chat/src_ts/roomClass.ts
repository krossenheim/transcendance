import type {
  T_ForwardToContainer,
  T_PayloadToUsers,
} from "./utils/api/service/hub/hub_interfaces.js";
import type { ErrorResponseType } from "./utils/api/service/common/error.js";
import type { WSInputHandlerReturnValue } from "./utils/socket_to_hub.js";
import { user_url } from "./utils/api/service/common/endpoints.js";
import {
  type TypeRoomSchema,
  type TypeStoredMessageSchema,
} from "./utils/api/service/chat/db_models.js";
import { Result } from "./utils/api/service/common/result.js";

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
    client_metadata: T_ForwardToContainer
  ): Result<WSInputHandlerReturnValue<typeof user_url.ws.chat.sendMessage.schema.output>, ErrorResponseType> {
    if (
      client_metadata.payload.roomId !== this.roomId ||
      this.users.indexOf(client_metadata.user_id) === -1
    ) {
      return Result.Ok({
        recipients: [client_metadata.user_id],
        code: user_url.ws.chat.sendMessage.schema.output.NotInRoom.code,
        payload: {
          message: `No such room (ID: ${client_metadata.payload.roomId}) or you are not in it.`,
        },
      });
    }
    if (!client_metadata.payload.messageString) {
      Result.Err("Received no message body");
    }
    const message = {
      messageId: this._current_message_id++,
      roomId: this.roomId,
      messageString: client_metadata.payload.messageString,
      messageDate: Date.now(),
      userId: client_metadata.user_id,
    };
    this.messages.add(message);
    return Result.Ok({
      recipients: this.users,
      funcId: client_metadata.funcId,
      code: user_url.ws.chat.sendMessage.schema.output.MessageSent.code,
      payload: message,
    });
  }

  addToRoom(
    client_metadata: T_ForwardToContainer
  ): Result<WSInputHandlerReturnValue<typeof user_url.ws.chat.addUserToRoom.schema.output>, ErrorResponseType> {
    if (this.allowedUsers.indexOf(client_metadata.user_id) === -1) {
      return Result.Ok({
        recipients: [client_metadata.user_id],
        code: user_url.ws.chat.addUserToRoom.schema.output.NotInRoom.code,
        payload: {
          message: `Can't add users to a room you are not in.`,
        },
      });
    }
    if (this.roomId !== client_metadata.payload.roomId) {
      return Result.Err({
        message: `Rooms handler incorrectly forwarded room ${this.roomId} a request for room ${client_metadata.payload.roomId}`,
      });
    }
    if (this.allowedUsers.indexOf(client_metadata.payload.user_to_add) !== -1) {
      return Result.Ok({
        recipients: [client_metadata.user_id],
        code: user_url.ws.chat.addUserToRoom.schema.output.AlreadyInRoom.code,
        payload: {
          message: `User ${client_metadata.payload.user_to_add} is already in the room.`,
          user: client_metadata.payload.user_to_add,
          roomId: this.roomId,
        },
      });
    }
    this.allowedUsers.push(client_metadata.payload.user_to_add);
    return Result.Ok({
      recipients: [
        client_metadata.user_id,
        client_metadata.payload.user_to_add,
      ],
      funcId: client_metadata.funcId,
      code: user_url.ws.chat.addUserToRoom.schema.output.UserAdded.code,
      payload: {
        user: client_metadata.payload.user_to_add,
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
    client_metadata: T_ForwardToContainer
  ): Result<WSInputHandlerReturnValue<typeof user_url.ws.chat.addRoom.schema.output>, ErrorResponseType> {
    const newroom = new Room(client_metadata.payload.roomName, DEBUGROOMID++);
    newroom.users.push(client_metadata.user_id);
    newroom.allowedUsers.push(client_metadata.user_id);
    this.rooms.push(newroom);
    return Result.Ok({
      recipients: [client_metadata.user_id],
      code: user_url.ws.chat.addRoom.schema.output.AddedRoom.code,
      payload: {
        roomId: newroom.roomId,
        roomName: newroom.room_name,
      },
    });
  }

  listRooms(
    client_metadata: T_ForwardToContainer
  ): Result<WSInputHandlerReturnValue<typeof user_url.ws.chat.listRooms.schema.output>, ErrorResponseType> {
    const list: Array<TypeRoomSchema> = [];

    for (const room of this.rooms) {
      if (room.users.find((id) => id === client_metadata.user_id)) {
        list.push({ roomName: room.room_name, roomId: room.roomId });
      }
    }
    console.log(`User ${client_metadata.user_id} sent list of rooms:${list}.`);

    return Result.Ok({
      recipients: [client_metadata.user_id],
      code: user_url.ws.chat.listRooms.schema.output.FullListGiven.code,
      payload: list,
    });
  }

  userJoinRoom(
    client_metadata: T_ForwardToContainer
  ): Result<WSInputHandlerReturnValue<typeof user_url.ws.chat.joinRoom.schema.output>, ErrorResponseType> {
    const room = this.getRoom(client_metadata.payload.roomId);
    if (room === null) {
      return Result.Ok({
        recipients: [client_metadata.user_id],
        code: user_url.ws.chat.joinRoom.schema.output.NoSuchRoom.code,
        payload: {
          message: `No such room (ID: ${client_metadata.payload.roomId}) or you are not in it.`,
        },
      });
    }
    if (room.allowedUsers.find((id) => id === client_metadata.user_id)) {
      if (room.users.find((id) => id === client_metadata.user_id)) {
        return Result.Ok({
          recipients: [client_metadata.user_id],
          code: user_url.ws.chat.joinRoom.schema.output.NoSuchRoom.code,
          payload: {
            message: `You are already in room (ID: ${client_metadata.payload.roomId}).`,
            user: client_metadata.user_id,
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
        code: user_url.ws.chat.joinRoom.code.Joined,
        payload: {
          user: client_metadata.user_id,
          roomId: room.roomId,
        },
      });
    }
    return Result.Ok({
      recipients: [client_metadata.user_id],
      funcId: client_metadata.funcId,
      code: user_url.ws.chat.joinRoom.code.NoSuchRoom,
      payload: {
        message: `No such room (ID: ${client_metadata.payload.roomId}) or you are not in it.`,
      },
    });
  }
}

export default ChatRooms;
