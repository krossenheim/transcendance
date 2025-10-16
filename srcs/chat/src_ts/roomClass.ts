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
  SendMessagePayloadSchema,
  type TypeUserSendMessagePayload,
} from "./utils/api/service/chat/chat_interfaces.js";
import httpStatus from "./utils/httpStatusEnum.js";
import { date, z } from "zod";
import { formatZodError } from "./utils/formatZodError.js";
import Containers from "./utils/internal_api.js";
import { int_url } from "./utils/api/service/common/endpoints.js";
import type { ErrorResponseType } from "./utils/api/service/common/error.js";
import {
  StoredMessageSchema,
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
  ): Result<TypeStoredMessageSchema, ErrorResponseType> {
    if (
      client_input.roomId !== this.roomId ||
      this.users.indexOf(client_metadata.user_id) === -1
    ) {
      return Result.Err({
        message: "No such room or user not in it",
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
    return Result.Ok(message);
  }

  equals(otherRoom: Room) {
    return otherRoom && this.roomId == otherRoom.roomId;
  }
}

// async function db_add_new_room(room_name : string)
// {
// 	const endpoint = endpoints.ws.chat.addRoom;
// 	const result = Containers.db.post(endpoint)
// }

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
    const room = this.rooms.find((room) => {
      roomId === room.roomId;
    });
    if (room === undefined) return null;
    return room;
  }

  async addRoom(
    client_request: T_ForwardToContainer
  ): Promise<T_PayloadToUsers> {
    const from_hub = ForwardToContainerSchema.safeParse(client_request);
    if (!from_hub.success) {
      console.error("Hub sent unrecognized message:", from_hub.error);
      throw Error("Hub sent unrecognized message");
    }
    const user_id = client_request.user_id;
    if (!user_id) {
      throw Error("Service called with no user id behind it.");
    }
    const valid_add_room_schema = AddRoomPayloadSchema.safeParse(
      client_request.payload
    );
    if (!valid_add_room_schema.success) {
      return formatZodError([user_id], valid_add_room_schema.error);
    }
    const { roomName } = client_request.payload;

    if (!roomName) {
      return {
        recipients: [user_id],
        funcId: "add_room",
        payload: {
          status: "THIS_MUST_BE_ERROR_RESPONSE_NOT_THIS_PAYLOAD",
          func_name: process.env.FUNC_POPUP_TEXT,
          pop_up_text: "No room name in payload, outdated schema.",
        },
      };
    }
    const responseResult = await Containers.db.post(
      int_url.http.db.createChatRoom,
      {
        roomName,
      }
    );
    if (responseResult.isErr()) {
      {
        return {
          recipients: [user_id],
          funcId: "add_room",
          payload: {
            status: "THIS_MUST_BE_ERROR_RESPONSE_NOT_THIS_PAYLOAD",
            func_name: process.env.FUNC_POPUP_TEXT,
            pop_up_text: "Request to create a chat room was unsuccesful.",
          },
        };
      }
    }
    const response = responseResult.unwrap();
    console.log("Response from db service:", response.status, response.data);

    if (response.status !== 201) {
      {
        {
          return {
            recipients: [user_id],
            funcId: "add_room",
            payload: {
              status: "aaaa",
              func_name: process.env.FUNC_POPUP_TEXT,
              pop_up_text: "Room was not created.",
            },
          };
        }
      }
    }
    const { roomId } = response.data;
    if (!roomId) {
      console.error(
        "Received null roomId from ",
        int_url.http.db.createChatRoom,
        "!!!\n@\n\n"
      );
      return {
        recipients: [user_id],
        funcId: "add_room",
        payload: {
          status: httpStatus.ALREADY_REPORTED,
          func_name: process.env.FUNC_POPUP_TEXT,
          pop_up_text:
            "Service db misconfigured, response data missing var room id.",
        },
      };
    }
    let room = new Room(roomName, roomId);
    if (this.rooms && this.rooms.some((r) => r.equals(room)))
      return {
        recipients: [user_id],
        funcId: "add_room",
        payload: {
          status: httpStatus.ALREADY_REPORTED,
          func_name: process.env.FUNC_POPUP_TEXT,
          pop_up_text: "Room " + roomName + "already exists.",
        },
      };
    room.users.push(user_id);
    room.allowedUsers.push(user_id);
    this.rooms.push(room);
    return {
      recipients: [user_id],
      funcId: "add_room",
      payload: {
        status: httpStatus.OK,
        func_name: process.env.FUNC_ADDED_ROOM_SUCCESS,
        room_name: room.room_name,
        roomId: room.roomId,
      },
    };
  }

  listRooms(client_request: T_ForwardToContainer): T_PayloadToUsers {
    const from_hub = ForwardToContainerSchema.safeParse(client_request);
    if (!from_hub.success) {
      console.error("exact fields expected at this stage: :", from_hub.error);
      throw Error("Data should be clean at this stage.");
    }
    const { user_id } = client_request;
    const list = [];

    for (const room of this.rooms) {
      if (user_id in room.users) {
        list.push(room.room_name);
      }
    }
    return {
      recipients: [user_id],
      funcId: "list_rooms",
      payload: {
        status: httpStatus.OK,
        func_name: process.env.FUNC_DISPLAY_ROOMS,
        room_list: list,
      },
    };
  }
}

export default ChatRooms;
