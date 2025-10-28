import type {
  T_ForwardToContainer,
  T_PayloadToUsers,
} from "./utils/api/service/hub/hub_interfaces.js";
import type { ErrorResponseType } from "./utils/api/service/common/error.js";
import type { WSHandlerReturnValue } from "./utils/socket_to_hub.js";
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
    user_id: number,
    roomIdReq: number,
    messageString: string
  ): Result<
    WSHandlerReturnValue<typeof user_url.ws.chat.sendMessage.schema.output>,
    ErrorResponseType
  > {
    if (roomIdReq !== this.roomId || this.users.indexOf(user_id) === -1) {
      return Result.Ok({
        recipients: [user_id],
        code: user_url.ws.chat.sendMessage.schema.output.NotInRoom.code,
        payload: {
          message: `No such room (ID: ${roomIdReq}) or you are not in it.`,
        },
      });
    }
    if (!messageString) {
      return Result.Ok({
        recipients: [user_id],
        code: user_url.ws.chat.sendMessage.schema.output.MessageTooShort.code,
        payload: {
          message: `No message given, at least one character required.`,
        },
      });
    }
    const message = {
      messageId: this._current_message_id++,
      roomId: this.roomId,
      messageString: messageString,
      messageDate: Date.now(),
      userId: user_id,
    };
    this.messages.add(message);
    return Result.Ok({
      recipients: this.users,
      funcId: user_url.ws.chat.sendMessage.funcId,
      code: user_url.ws.chat.sendMessage.schema.output.MessageSent.code,
      payload: message,
    });
  }

  addToRoom(
    user_id: number,
    userToAdd: number
  ): Result<
    WSHandlerReturnValue<typeof user_url.ws.chat.addUserToRoom.schema.output>,
    ErrorResponseType
  > {
    if (this.allowedUsers.indexOf(user_id) === -1) {
      return Result.Ok({
        recipients: [user_id],
        code: user_url.ws.chat.addUserToRoom.schema.output.NotInRoom.code,
        payload: {
          message: `Can't add users to a room you are not in.`,
        },
      });
    }
    if (this.allowedUsers.indexOf(userToAdd) !== -1) {
      return Result.Ok({
        recipients: [user_id],
        code: user_url.ws.chat.addUserToRoom.schema.output.AlreadyInRoom.code,
        payload: {
          message: `User ${userToAdd} is already in the room.`,
          user: userToAdd,
          roomId: this.roomId,
        },
      });
    }
    this.allowedUsers.push(userToAdd);
    return Result.Ok({
      recipients: [user_id, userToAdd],
      funcId: user_url.ws.chat.addUserToRoom.funcId,
      code: user_url.ws.chat.addUserToRoom.schema.output.UserAdded.code,
      payload: {
        user: userToAdd,
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
    roomNameReq: string,
    user_id: number
  ): Result<
    WSHandlerReturnValue<typeof user_url.ws.chat.addRoom.schema.output>,
    ErrorResponseType
  > {
    const newroom = new Room(roomNameReq, DEBUGROOMID++);
    newroom.users.push(user_id);
    newroom.allowedUsers.push(user_id);
    this.rooms.push(newroom);
    return Result.Ok({
      recipients: [user_id],
      code: user_url.ws.chat.addRoom.schema.output.AddedRoom.code,
      payload: {
        roomId: newroom.roomId,
        roomName: newroom.room_name,
      },
    });
  }

  listRooms(
    user_id: number
  ): Result<
    WSHandlerReturnValue<typeof user_url.ws.chat.listRooms.schema.output>,
    ErrorResponseType
  > {
    const list: Array<TypeRoomSchema> = [];

    for (const room of this.rooms) {
      if (room.users.find((id) => id === user_id)) {
        list.push({ roomName: room.room_name, roomId: room.roomId });
      }
    }
    console.log(`User ${user_id} sent list of rooms:${list}.`);

    return Result.Ok({
      recipients: [user_id],
      code: user_url.ws.chat.listRooms.schema.output.FullListGiven.code,
      payload: list,
    });
  }

  userJoinRoom(
    roomIdReq: number,
    user_id: number
  ): Result<
    WSHandlerReturnValue<typeof user_url.ws.chat.joinRoom.schema.output>,
    ErrorResponseType
  > {
    const room = this.getRoom(roomIdReq);
    if (room === null) {
      return Result.Ok({
        recipients: [user_id],
        code: user_url.ws.chat.joinRoom.schema.output.NoSuchRoom.code,
        payload: {
          message: `No such room (ID: ${roomIdReq}) or you are not in it.`,
        },
      });
    }
    if (room.allowedUsers.find((id) => id === user_id)) {
      if (room.users.find((id) => id === user_id)) {
        return Result.Ok({
          recipients: [user_id],
          code: user_url.ws.chat.joinRoom.schema.output.NoSuchRoom.code,
          payload: {
            message: `You are already in room (ID: ${roomIdReq}).`,
            user: user_id,
            roomId: room.roomId,
          },
        });
      }
      room.users.push(user_id);
      console.log(`User ${user_id} joined room ${room.roomId}.`);
      return Result.Ok({
        recipients: room.users,
        funcId: user_url.ws.chat.joinRoom.funcId,
        code: user_url.ws.chat.joinRoom.code.Joined,
        payload: {
          user: user_id,
          roomId: room.roomId,
        },
      });
    }
    return Result.Ok({
      recipients: [user_id],
      funcId: user_url.ws.chat.joinRoom.funcId,
      code: user_url.ws.chat.joinRoom.code.NoSuchRoom,
      payload: {
        message: `No such room (ID: ${roomIdReq}) or you are not in it.`,
      },
    });
  }
}

export default ChatRooms;
