import type { ErrorResponseType } from "./utils/api/service/common/error.js";
import type { WSHandlerReturnValue } from "./utils/socket_to_hub.js";
import { int_url, user_url } from "./utils/api/service/common/endpoints.js";
import {
  ChatRoomUserAccessType,
  type TypeFullRoomInfoSchema,
  type TypeRoomSchema,
  type TypeStoredMessageSchema,
} from "./utils/api/service/chat/db_models.js";
import { Result } from "./utils/api/service/common/result.js";
import containers from "./utils/internal_api.js";

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
  public readonly room_type: number;
  public users: Array<number>;
  public messages: FixedSizeList<TypeStoredMessageSchema>;
  public allowedUsers: Array<any>;
  public readonly max_messages: number;

  constructor(room_data: TypeRoomSchema, user_connections? : Array<[number, number]>) {
    this.roomId = room_data.roomId;
    this.room_name = room_data.roomName;
    // Persist room type so handlers can enforce DM invariants (2 = DM)
    this.room_type = (room_data as any).roomType ?? 1;
    this.users = user_connections ? user_connections.filter(uc => uc[1] === ChatRoomUserAccessType.JOINED).map(uc => uc[0]) : new Array();
    this.max_messages = 20;
    this.messages = new FixedSizeList(this.max_messages);
    this.allowedUsers = user_connections ? user_connections.map(uc => uc[0]) : new Array();
  }

  //////
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

  getRoomType(): number {
    return this.room_type;
  }
}

let DEBUGROOMID = 1;
class ChatRooms {
  public rooms: Array<Room>;
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

  getAllUsers(): Set<number> {
    const allUsers = new Set<number>();
    for (const room of this.rooms) {
      for (const userId of room.users) {
        allUsers.add(userId);
      }
    }
    return allUsers;
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
    user_id: number
  ): Promise<Result<
    WSHandlerReturnValue<typeof user_url.ws.chat.addRoom.schema.output>,
    ErrorResponseType
  >> {
    const newRoomResult = await containers.db.post(int_url.http.db.createChatRoom, {
      roomName: roomNameReq,
      roomType: 1,
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
    this.rooms.push(newroom);
    return Result.Ok({
      recipients: [user_id],
      code: user_url.ws.chat.addRoom.schema.output.AddedRoom.code,
      payload: room_data,
    });
  }

  async getOrCreateDMRoom(user1_id: number, user2_id: number): Promise<{ room: Room | null, wasCreated: boolean }> {
    // DM room naming convention: "DM {lower_id} {higher_id}" (spaces allowed, underscores not)
    const [lowerId, higherId] = user1_id < user2_id ? [user1_id, user2_id] : [user2_id, user1_id];
    const dmRoomName = `DM ${lowerId} ${higherId}`;

    console.log(`[DM] Looking for DM room between ${user1_id} and ${user2_id}: ${dmRoomName}`);

    // Check if DM room already exists in memory
    let existingRoom = this.rooms.find(room => room.room_name === dmRoomName);
    if (existingRoom) {
      console.log(`[DM] Found existing DM room in memory: ${existingRoom.roomId}`);
      return { room: existingRoom, wasCreated: false };
    }

    // Check if DM room exists in database but not in memory
    console.log(`[DM] Checking database for existing DM room...`);
    const userRoomsResult = await containers.db.get(int_url.http.db.getUserRooms, { userId: user1_id });
    if (userRoomsResult.isOk() && userRoomsResult.unwrap().status === 200) {
      const userRooms = userRoomsResult.unwrap().data as TypeRoomSchema[];
      const existingDMInDB = userRooms.find(room => room.roomName === dmRoomName);
      
      if (existingDMInDB) {
        console.log(`[DM] Found existing DM room in database: ${existingDMInDB.roomId}, loading into memory`);
        
        // Fetch full room info to get user connections
        const roomInfoResult = await containers.db.get(int_url.http.db.getRoomInfo, { roomId: existingDMInDB.roomId });
        if (roomInfoResult.isOk() && roomInfoResult.unwrap().status === 200) {
          const roomInfo = roomInfoResult.unwrap().data as TypeFullRoomInfoSchema;
          
          // Create Room object with proper user connections
          const userConnections: Array<[number, number]> = roomInfo.userConnections.map(uc => [uc.userId, uc.userState]);
          existingRoom = new Room(existingDMInDB, userConnections);
          this.rooms.push(existingRoom);
          
          console.log(`[DM] Loaded existing DM room ${existingRoom.roomId} with ${existingRoom.users.length} joined users`);
          return { room: existingRoom, wasCreated: false };
        }
      }
    }

    console.log(`[DM] Creating new DM room ${dmRoomName}`);

    // Create new DM room
    const newRoomResult = await containers.db.post(int_url.http.db.createChatRoom, {
      roomName: dmRoomName,
      roomType: 2, // Type 2 for DM rooms
      owner: user1_id,
    });

    if (newRoomResult.isErr()) {
      console.error("[DM] Failed to create DM room - error:", newRoomResult.unwrapErr());
      return { room: null, wasCreated: false };
    }

    if (newRoomResult.unwrap().status !== 201) {
      console.error("[DM] Failed to create DM room - status:", newRoomResult.unwrap().status);
      return { room: null, wasCreated: false };
    }

    const room_data = newRoomResult.unwrap().data as TypeRoomSchema;
    console.log(`[DM] Created room ${room_data.roomId}, adding both users to DB`);

    // Add user2 to the room in the database
    const addUser2Result = await containers.db.post(int_url.http.db.addUserToRoom, {
      roomId: room_data.roomId,
      user_to_add: user2_id,
      type: ChatRoomUserAccessType.JOINED,
    });

    if (addUser2Result.isErr() || addUser2Result.unwrap().status !== 200) {
      console.error("[DM] Failed to add user2 to room:", addUser2Result.isErr() ? addUser2Result.unwrapErr() : addUser2Result.unwrap());
    } else {
      console.log(`[DM] Successfully added user ${user2_id} to room ${room_data.roomId}`);
    }

    // Add both users as joined members in the Room object
    const newRoom = new Room(room_data, [
      [user1_id, ChatRoomUserAccessType.JOINED],
      [user2_id, ChatRoomUserAccessType.JOINED]
    ]);
    this.rooms.push(newRoom);

    console.log(`[DM] Successfully created DM room ${newRoom.roomId}`);
    return { room: newRoom, wasCreated: true };
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
    user_id: number
  ): Promise<Result<
    WSHandlerReturnValue<typeof user_url.ws.chat.joinRoom.schema.output>,
    ErrorResponseType
  >> {
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
    
    // Allow joining if:
    // 1. User is in allowedUsers (invited/member), OR
    // 2. Room is named "Public Chat" (open to all)
    const isPublicChat = room.room_name === "Public Chat";
    const isAllowed = room.allowedUsers.find((id) => id === user_id) || isPublicChat;
    
    if (isAllowed) {
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
      // Also add to allowedUsers if joining public chat for the first time
      if (isPublicChat && !room.allowedUsers.find((id) => id === user_id)) {
        room.allowedUsers.push(user_id);
      }
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
