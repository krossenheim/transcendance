import { int_url, user_url } from "@app/shared/api/service/common/endpoints";
import { ChatRoomType } from "@app/shared/api/service/chat/chat_interfaces";
import type { ErrorResponseType } from "@app/shared/api/service/common/error";
import type { WSHandlerReturnValue } from "@app/shared/websocketResponse";
import type { OurSocket } from "@app/shared/socket_to_hub";
import {
  ChatRoomUserAccessType,
  type TypeFullRoomInfoSchema,
  type TypeRoomSchema,
  type TypeStoredMessageSchema,
} from "@app/shared/api/service/chat/db_models";
import { Result } from "@app/shared/api/service/common/result";
import containers from "@app/shared/internal_api";

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
  public readonly room_type: ChatRoomType;
  public users: Array<number>;
  public messages: FixedSizeList<TypeStoredMessageSchema>;
  public allowedUsers: Array<any>;
  public readonly max_messages: number;

  constructor(room_data: TypeRoomSchema, user_connections?: Array<[number, number]>) {
    this.roomId = room_data.roomId;
    this.room_name = room_data.roomName;
    this.room_type = room_data.roomType;
    this.users = user_connections ? user_connections.filter(uc => uc[1] === ChatRoomUserAccessType.JOINED).map(uc => uc[0]) : new Array();
    this.max_messages = 20;
    this.messages = new FixedSizeList(this.max_messages);
    this.allowedUsers = user_connections ? user_connections.map(uc => uc[0]) : new Array();
  }

  removeUser(user: any) {
    this.users = this.users.filter((u) => u !== user);
  }

  getId(): number {
    return this.roomId;
  }

  async sendMessage(
    user_id: number,
    roomIdReq: number,
    messageString: string
  ): Promise<Result<
    WSHandlerReturnValue<typeof user_url.ws.chat.sendMessage.schema.output>,
    ErrorResponseType
  >> {
    if (user_id !== 1) {
      if (
        roomIdReq !== this.roomId ||
        this.allowedUsers.indexOf(user_id) === -1
      ) {
        return Result.Ok({
          recipients: [user_id],
          code: user_url.ws.chat.sendMessage.schema.output.NotInRoom.code,
          payload: {
            message: `No such room (ID: ${roomIdReq}) or you are not in it.`,
          },
        });
      }
      if (this.users.indexOf(user_id) === -1) {
        return Result.Ok({
          recipients: [user_id],
          code: user_url.ws.chat.sendMessage.schema.output.InvitationNotAccepted
            .code,
          payload: {
            message: `You are allowed to use room with ID ${roomIdReq}, but first join it using function ${user_url.ws.chat.joinRoom.funcId}`,
          },
        });
      }
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

    const storeMessageResult = await containers.db.post(int_url.http.db.sendMessage, {
      roomId: this.roomId,
      messageString: messageString,
      userId: user_id,
    });

    if (storeMessageResult.isErr()) {
      return Result.Ok({
        recipients: [user_id],
        code: user_url.ws.chat.sendMessage.schema.output.FailedToStoreMessage.code,
        payload: {
          message: `Could not store your message, try again later.`,
        },
      });
    }

    if (storeMessageResult.unwrap().status !== 200) {
      return Result.Ok({
        recipients: [user_id],
        code: user_url.ws.chat.sendMessage.schema.output.FailedToStoreMessage.code,
        payload: {
          message: `Could not store your message, try again later.`,
        },
      });
    }

    const message = storeMessageResult.unwrap().data as TypeStoredMessageSchema;
    this.messages.add(message);
    return Result.Ok({
      recipients: this.users,
      funcId: user_url.ws.chat.sendMessage.funcId,
      code: user_url.ws.chat.sendMessage.schema.output.MessageSent.code,
      payload: message,
    });
  }

  async addToRoom(
    user_id: number,
    userToAdd: number
  ): Promise<Result<
    WSHandlerReturnValue<typeof user_url.ws.chat.addUserToRoom.schema.output>,
    ErrorResponseType
  >> {
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
    const storageResult = await containers.db.post(int_url.http.db.addUserToRoom, {
      roomId: this.roomId,
      user_to_add: userToAdd,
      type: ChatRoomUserAccessType.INVITED,
    });

    if (storageResult.isErr() || storageResult.unwrap().status !== 200) {
      return Result.Ok({
        recipients: [user_id],
        code: user_url.ws.chat.addUserToRoom.schema.output.FailedToAddUser.code,
        payload: {
          message: `Could not add user ${userToAdd} to room.`,
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

  getRoomType(): ChatRoomType {
    return this.room_type;
  }

  isDM(user1: number, user2: number): boolean {
    if (this.room_type !== ChatRoomType.DIRECT_MESSAGE) {
      return false;
    }
    return this.allowedUsers.includes(user1) && this.allowedUsers.includes(user2);
  }
}

class ChatRooms {
  public rooms: Map<number, Room>;
  public static instance: ChatRooms;

  constructor() {
    this.rooms = new Map();

    if (ChatRooms.instance) {
      return ChatRooms.instance;
    }
    ChatRooms.instance = this;

    return this;
  }

  getRoom(roomId: number): Room | null {
    return this.rooms.get(roomId) || null;
  }

  getAllUsers(): Set<number> {
    const allUsers = new Set<number>();
    for (const room of this.rooms.values()) {
      for (const userId of room.users) {
        allUsers.add(userId);
      }
    }
    return allUsers;
  }

  async fetchRoom(roomId: number): Promise<Result<Room, string>> {
    const room = this.getRoom(roomId);
    if (room)
      return Result.Ok(room);

    const roomInfoResult = await containers.db.get(int_url.http.db.getRoomInfo, { roomId });

    if (roomInfoResult.isErr() || roomInfoResult.unwrap().status !== 200) {
      if (roomInfoResult.isErr()) {
        console.error("Error fetching room info:", roomInfoResult.unwrapErr());
      } else {
        console.error("Error fetching room info, status:", roomInfoResult.unwrap().status);
        console.error("Response data:", roomInfoResult.unwrap().data);
      }
      return Result.Err("Failed to fetch room info");
    }

    const roomInfo = roomInfoResult.unwrap().data as TypeFullRoomInfoSchema;
    const userConnections: Array<[number, number]> = roomInfo.userConnections.map(uc => [uc.userId, uc.userState]);
    const newRoom = new Room(roomInfo.room, userConnections);
    this.rooms.set(newRoom.roomId, newRoom);
    return Result.Ok(newRoom);
  }

  async fetchRoomById(roomId: number, userId: number): Promise<Result<
    WSHandlerReturnValue<typeof user_url.ws.chat.getRoomData.schema.output>,
    ErrorResponseType
  >> {
    const roomInfoResult = await containers.db.get(int_url.http.db.getRoomInfo, { roomId });

    if (roomInfoResult.isErr() || roomInfoResult.unwrap().status !== 200) {
      if (roomInfoResult.isErr()) {
        console.error("Error fetching room info:", roomInfoResult.unwrapErr());
      } else {
        console.error("Error fetching room info, status:", roomInfoResult.unwrap().status);
        console.error("Response data:", roomInfoResult.unwrap().data);
      }
      return Result.Ok({
        recipients: [userId],
        code: user_url.ws.chat.getRoomData.schema.output.NoSuchRoom.code,
        payload: {
          message: `No such room (ID: ${roomId}) or you are not in it.`,
        },
      });
    }

    const roomInfo = roomInfoResult.unwrap().data as TypeFullRoomInfoSchema;
    return Result.Ok({
      recipients: [userId],
      code: user_url.ws.chat.getRoomData.schema.output.RoomDataProvided.code,
      payload: roomInfo,
    });
  }

  async addRoom(
    roomNameReq: string,
    user_id: number,
  ): Promise<Result<
    WSHandlerReturnValue<typeof user_url.ws.chat.addRoom.schema.output>,
    ErrorResponseType
  >> {
    const newRoomResult = await containers.db.post(int_url.http.db.createChatRoom, {
      roomName: roomNameReq,
      owner: user_id,
    });

    if (newRoomResult.isErr() || newRoomResult.unwrap().status !== 201) {
      return Result.Ok({
        recipients: [user_id],
        code: user_url.ws.chat.addRoom.schema.output.FailedToAddRoom.code,
        payload: {
          message: `Could not create requested room by name: ${roomNameReq}`,
        },
      });
    }

    const room_data = newRoomResult.unwrap().data as TypeRoomSchema;
    const newroom = new Room(room_data, [[user_id, ChatRoomUserAccessType.JOINED]]);
    this.rooms.set(newroom.roomId, newroom);

    const userData = await containers.db.fetchUserData(user_id, true);
    const userRepr = userData.isOk() ? userData.unwrap().username : user_id;
    containers.chat.post(int_url.http.chat.sendSystemMessage, {
      roomId: newroom.roomId,
      messageString: `Room "${room_data.roomName}" created by ${userRepr}!`,
    }).catch((err) => {
      console.error('Failed to send system message for new room:', err);
    });

    return Result.Ok({
      recipients: [user_id],
      code: user_url.ws.chat.addRoom.schema.output.AddedRoom.code,
      payload: room_data,
    });
  }

  async getOrCreateDMRoom(user1_id: number, user2_id: number): Promise<Result<{ room: Room, created: boolean }, string>> {
    const currentRoom = Array.from(this.rooms.values()).find(room => room.isDM(user1_id, user2_id));
    if (currentRoom)
      return Result.Ok({ room: currentRoom, created: false });

    const userRoomsResult = await containers.db.get(int_url.http.db.fetchDMRoomInfo, { userId1: user1_id, userId2: user2_id });
    console.log("Fetched DM room info result:", userRoomsResult);
    if (userRoomsResult.isOk() && userRoomsResult.unwrap().status === 200) {
      console.log("DM room found in DB, loading...");
      const roomData = userRoomsResult.unwrap().data.room as TypeFullRoomInfoSchema;
      this.rooms.set(roomData.room.roomId, new Room(roomData.room, roomData.userConnections.map(uc => [uc.userId, uc.userState])));
      return Result.Ok({ room: this.rooms.get(roomData.room.roomId)!, created: userRoomsResult.unwrap().data.created });
    }

    return Result.Err("Failed to fetch or create DM room");
  }

  async listRooms(
    user_id: number
  ): Promise<Result<
    WSHandlerReturnValue<typeof user_url.ws.chat.listRooms.schema.output>,
    ErrorResponseType
  >> {
    const listRoomsResult = await containers.db.get(int_url.http.db.getUserRooms, { userId: user_id });
    if (listRoomsResult.isErr() || listRoomsResult.unwrap().status !== 200) {
      return Result.Ok({
        recipients: [user_id],
        code: user_url.ws.chat.listRooms.schema.output.NoListGiven.code,
        payload: {
          message: `Could not retrieve your rooms.`,
        },
      });
    }

    const list = listRoomsResult.unwrap().data as TypeRoomSchema[];
    return Result.Ok({
      recipients: [user_id],
      code: user_url.ws.chat.listRooms.schema.output.FullListGiven.code,
      payload: list,
    });
  }

  // {"funcId":"/api/chat/join_room","payload":{"roomId":1},"target_container":"chat"}
  async userJoinRoom(
    roomIdReq: number,
    user_id: number,
    internal_socket: OurSocket,
  ): Promise<Result<
    WSHandlerReturnValue<typeof user_url.ws.chat.joinRoom.schema.output>,
    ErrorResponseType
  >> {
    // Use fetchRoom to load the room from DB if not in memory
    const roomResult = await this.fetchRoom(roomIdReq);
    if (roomResult.isErr()) {
      return Result.Ok({
        recipients: [user_id],
        code: user_url.ws.chat.joinRoom.schema.output.NoSuchRoom.code,
        payload: {
          message: `No such room (ID: ${roomIdReq}) or you are not in it.`,
        },
      });
    }
    const room = roomResult.unwrap();

    // Check if user is already in the room
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

    const isAllowed = room.allowedUsers.find((id) => id === user_id);
    if (isAllowed !== undefined) {
      const userConnectionResult = await containers.db.post(int_url.http.db.addUserToRoom, {
        roomId: room.roomId,
        user_to_add: user_id,
        type: ChatRoomUserAccessType.JOINED,
      });
      if (userConnectionResult.isErr() || userConnectionResult.unwrap().status !== 200) {
        return Result.Ok({
          recipients: [user_id],
          code: user_url.ws.chat.joinRoom.schema.output.FailedToJoinRoom.code,
          payload: {
            message: `Could not join room (ID: ${roomIdReq}).`,
          },
        });
      }

      room.users.push(user_id);
      console.log(`User ${user_id} joined room ${room.roomId}.`);
      internal_socket.invokeHandler(
        user_url.ws.users.userOnlineStatusUpdate,
        room.users,
        null
      );
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

  async userLeaveRoom(
    roomIdReq: number,
    user_id: number,
    internal_socket: OurSocket,
  ): Promise<Result<
    WSHandlerReturnValue<typeof user_url.ws.chat.leaveRoom.schema.output>,
    ErrorResponseType
  >> {
    const room = this.getRoom(roomIdReq);
    if (room === null) {
      return Result.Ok({
        recipients: [user_id],
        code: user_url.ws.chat.leaveRoom.schema.output.NoSuchRoom.code,
        payload: {
          message: `No such room (ID: ${roomIdReq}).`,
        },
      });
    }

    // Check if user is actually in the room
    const userIndex = room.users.findIndex((id) => id === user_id);
    if (userIndex === -1) {
      return Result.Ok({
        recipients: [user_id],
        code: user_url.ws.chat.leaveRoom.schema.output.NoSuchRoom.code,
        payload: {
          message: `You are not in room (ID: ${roomIdReq}).`,
        },
      });
    }

    const removeUserResult = await containers.db.post(int_url.http.db.removeUserFromRoom, {
      roomId: room.roomId,
      user_to_remove: user_id,
    });
    console.log(`[leaveRoom] removeUserFromRoom result:`, removeUserResult.isOk() ? removeUserResult.unwrap() : removeUserResult.unwrapErr());
    if (removeUserResult.isErr() || removeUserResult.unwrap().status !== 200) {
      console.error(`[leaveRoom] Failed to remove user ${user_id} from room ${roomIdReq}:`, removeUserResult.isErr() ? removeUserResult.unwrapErr() : removeUserResult.unwrap());
      return Result.Ok({
        recipients: [user_id],
        code: user_url.ws.chat.leaveRoom.schema.output.FailedToLeaveRoom.code,
        payload: {
          message: `Could not leave room (ID: ${roomIdReq}).`,
        },
      });
    }

    // Remove user from in-memory arrays
    room.users.splice(userIndex, 1);
    const allowedIndex = room.allowedUsers.findIndex((id) => id === user_id);
    if (allowedIndex !== -1) {
      room.allowedUsers.splice(allowedIndex, 1);
    }

    console.log(`User ${user_id} left room ${room.roomId}.`);

    // Notify remaining users that user left
    return Result.Ok({
      recipients: [...room.users, user_id],
      funcId: user_url.ws.chat.leaveRoom.funcId,
      code: user_url.ws.chat.leaveRoom.code.Left,
      payload: {
        user: user_id,
        roomId: room.roomId,
      },
    });
  }
}

export default ChatRooms;
