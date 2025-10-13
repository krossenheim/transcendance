import {
  ForwardToContainerSchema,
  PayloadToUsersSchema,
} from "./utils/api/service/hub/hub_interfaces.js";

import {
  AddRoomPayloadSchema,
  AddToRoomPayloadSchema,
  SendMessagePayloadSchema,
} from "./utils/api/service/chat/chat_interfaces.js";
import httpStatus from "./utils/httpStatusEnum.js";
import { z } from "zod";
import { formatZodError } from "./utils/formatZodError.js";
import { Result } from "./utils/api/service/common/result.js";
import Containers from "./utils/internal_api.js";
import { int_url } from "./utils/api/service/common/endpoints.js";

function toInt(value: string) {
  const num = Number(value);
  if (!Number.isInteger(num)) {
    throw new TypeError(`Cannot convert "${value}" to integer`);
  }
  return num;
}

type T_ForwardToContainer = z.infer<typeof ForwardToContainerSchema>;
type T_PayloadToUsers = z.infer<typeof PayloadToUsersSchema>;

class FixedSizeList {
  public list: Array<number>;
  public maxSize: number;
  constructor(maxSize = 10) {
    this.maxSize = maxSize;
    this.list = [];
  }

  add(item: string) {
    this.list.push(toInt(item));

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
  public readonly room_id: number;
  public users: Array<number>;
  public messages: FixedSizeList;
  public allowedUsers: Array<any>;

  constructor(room_name: string, room_id: number) {
    this.room_id = room_id;
    this.room_name = room_name;
    this.users = new Array();
    this.messages = new FixedSizeList(20);
    this.allowedUsers = new Array();
  }

  addUser(client_request: T_ForwardToContainer): T_PayloadToUsers {
    const validation = ForwardToContainerSchema.safeParse(client_request);
    if (!validation.success) {
      console.error("exact fields expected at this stage: :", validation.error);
      throw Error("Data should be clean at this stage.");
    }
    const { user_id } = client_request;
    const validate_user_add = AddToRoomPayloadSchema.safeParse(
      client_request.payload
    );
    if (!validate_user_add.success) {
      return formatZodError([user_id], validate_user_add.error);
    }
    const { user_to_add, room_name } = client_request.payload;

    // Validate user id to add to add with auth
    if (room_name != this.room_name) {
      console.error(
        `Room name doesn't match the requested name, request was: ${JSON.stringify(
          client_request
        )}`
      );
      throw new Error(
        `Room name doesn't match the requested name, request was: ${JSON.stringify(
          client_request
        )}`
      );
    }
    if (!this.users.includes(user_id)) {
      console.log(
        `Userid ${user_id} is not in room ${
          this.room_name
        }, request was: ${JSON.stringify(client_request)}`
      );
      return {
        recipients: [user_id],
        funcId: "add_user_to_room",
        payload: {
          status: httpStatus.BAD_REQUEST,
          func_name: process.env.FUNC_POPUP_TEXT,
          pop_up_text:
            "A room " +
            room_name +
            " doesn't exist or user_id " +
            room_name +
            "isnt in it.",
        },
      };
    }
    if (this.users.includes(user_to_add))
      return {
        recipients: [user_id],
        funcId: "add_user_to_room",
        payload: {
          status: httpStatus.ALREADY_REPORTED,
          func_name: process.env.FUNC_POPUP_TEXT,
          room_name: this.room_name,
          message: `User ${user_to_add} already in room ${room_name}.`,
        },
      };
    // import { db_interface_add_user } from "";

    // const query_result: Result = db_interface_add_user();
    // if (query_result.isErr)
    this.users.push(toInt(user_to_add));
    return {
      recipients: this.users,
      funcId: "add_user_to_room",
      payload: {
        status: httpStatus.OK,
        func_name: process.env.FUNC_ADD_MESSAGE_TO_ROOM,
        room_name: this.room_name,
        message: `User ${user_id} has added ${user_to_add}`,
      },
    };
  }

  removeUser(user: any) {
    this.users = this.users.filter((u) => u !== user);
  }

  sendMessage(client_request: T_ForwardToContainer): T_PayloadToUsers {
    const validation = ForwardToContainerSchema.safeParse(client_request);
    if (!validation.success) {
      console.error("exact fields expected at this stage: :", validation.error);
      throw Error("Data should be clean at this stage.");
    }
    const user_id = validation.data.user_id;
    const valid_message_to_send = SendMessagePayloadSchema.safeParse(
      validation.data.payload
    );
    if (!valid_message_to_send.success) {
      return formatZodError([user_id], valid_message_to_send.error);
    }
    const { messageString: messageReceived, room_id } =
      valid_message_to_send.data;
    if (!messageReceived) {
      return {
        recipients: [user_id],
        funcId: "send_message_to_room",
        payload: {
          status: httpStatus.BAD_REQUEST,
          func_name: process.env.FUNC_POPUP_TEXT,
          pop_up_text: "User did not send a message.",
        },
      };
    }
    if (this.room_id != room_id) {
      console.error(
        `Wrong roomg (id ${this.room_id}) being asked to
         broadcast message on behalf of user: (id ${user_id})`
      );
      return {
        recipients: [user_id],
        funcId: "send_message_to_room",
        payload: {
          status: 666,
          func_name: "aaa",
          pop_up_text: "Internal error when dealing with room id:" + room_id,
        },
      };
    }
    if (!this.users.includes(user_id)) {
      console.log(
        `Userid ${user_id} is not in room ${
          this.room_name
        },users in it are: [${this.users.join(
          ", "
        )}], request was: ${JSON.stringify(client_request)}`
      );
      return {
        recipients: [user_id],
        funcId: "send_message_to_room",
        payload: {
          status: httpStatus.BAD_REQUEST,
          func_name: process.env.FUNC_POPUP_TEXT,
          pop_up_text: "Room " + room_id + " doesn't exist or user isnt in it.",
        },
      };
    } else {
      console.log(
        `Userid ${user_id} joined room ${
          this.room_name
        }, request was: ${JSON.stringify(client_request)}`
      );
      return {
        recipients: this.users,
        funcId: "send_message_to_room",
        payload: {
          status: 33,
          func_name: "galibaprafasaal",
          room_name: this.room_name,
          message: messageReceived,
        },
      };
    }
  }

  equals(otherRoom: Room) {
    return otherRoom && this.room_id == otherRoom.room_id;
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

    // Initialize your ChatRooms properties here

    // Cache the instancefco
    ChatRooms.instance = this;

    return this;
  }

  async addRoom(
    client_request: T_ForwardToContainer
  ): Promise<T_PayloadToUsers> {
    const validation = ForwardToContainerSchema.safeParse(client_request);
    if (!validation.success) {
      console.error("exact fields expected at this stage: :", validation.error);
      throw Error("Data should be clean at this stage.");
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
    const response = await Containers.db.post(int_url.http.db.createChatRoom, {
      roomName,
    });
    if (response === undefined) {
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
    console.log("Response from db service:", response.status, response.data);

    if (response.status === 400) {
      {
        {
          return {
            recipients: [user_id],
            funcId: "add_room",
            payload: {
              status: "THIS_MUST_BE_ERROR_RESPONSE_NOT_THIS_PAYLOAD",
              func_name: process.env.FUNC_POPUP_TEXT,
              pop_up_text: "Invalid ROOM data or ROOM already exists",
            },
          };
        }
      }
    }
    const { roomId } = response.data;
    if (!roomId) {
      console.error(
        "Received null room_id from ",
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
        room_id: room.room_id,
      },
    };
  }

  listRooms(client_request: T_ForwardToContainer): T_PayloadToUsers {
    const validation = ForwardToContainerSchema.safeParse(client_request);
    if (!validation.success) {
      console.error("exact fields expected at this stage: :", validation.error);
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

  sendMessage(client_request: T_ForwardToContainer): T_PayloadToUsers {
    const validation = ForwardToContainerSchema.safeParse(client_request);
    if (!validation.success) {
      console.error("exact fields expected at this stage: :", validation.error);
      throw Error("Data should be clean at this stage.");
    }
    const { user_id } = client_request;
    if (!user_id) {
      throw Error("Service called with no user id behind it.");
    }
    const validate_message = SendMessagePayloadSchema.safeParse(
      client_request.payload
    );
    if (!validate_message.success) {
      return formatZodError([user_id], validate_message.error);
    }
    let targetRoom = this.rooms.find(
      (room) => validate_message.data.room_id === room.room_id
    );
    if (targetRoom == undefined)
      return {
        recipients: [user_id],
        funcId: "send_message_to_room",
        payload: {
          status: httpStatus.NOT_FOUND,
          func_name: process.env.FUNC_POPUP_TEXT,
          pop_up_text:
            "Room id " + validate_message.data.room_id + " doesn't exist.",
        },
      };

    return targetRoom.sendMessage(client_request);
  }

  addUserToRoom(client_request: T_ForwardToContainer): T_PayloadToUsers {
    const validation = ForwardToContainerSchema.safeParse(client_request);
    if (!validation.success) {
      console.error("exact fields expected at this stage: :", validation.error);
      throw Error("Data should be clean at this stage.");
    }
    const { user_id } = client_request;
    const valid_user_to_room_request = AddToRoomPayloadSchema.safeParse(
      client_request.payload
    );

    if (!valid_user_to_room_request.success)
      return formatZodError([user_id], valid_user_to_room_request.error);

    const { room_name } = client_request.payload;
    if (!user_id) {
      throw new Error("No userid for request");
    }

    let targetRoom = this.rooms.find((room) => room_name === room.room_name);
    if (targetRoom == undefined)
      return {
        recipients: [user_id],
        funcId: "add_user_to_room",
        payload: {
          status: httpStatus.NOT_FOUND,
          func_name: process.env.FUNC_POPUP_TEXT,
          pop_up_text: "Room " + room_name + " doesn't exist.",
        },
      };

    return targetRoom.addUser(client_request);
  }
}

export default ChatRooms;
