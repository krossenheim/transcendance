import {
  ForwardToContainerSchema,
  PayloadToUsersSchema,
} from "./utils/api/service/hub/hub_interfaces.js";
import user, { FullUser } from "./utils/api/service/db/user.js";

import {
  AddRoomPayloadSchema,
  AddToRoomPayloadSchema,
  SendMessagePayloadSchema,
} from "./utils/api/service/chat/chat_interfaces.js";
import httpStatus from "./utils/httpStatusEnum.js";
import { z } from "zod";
import { formatZodError } from "./utils/formatZodError.js";
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

  async addUser(
    client_request: T_ForwardToContainer
  ): Promise<T_PayloadToUsers> {
    const from_hub = ForwardToContainerSchema.safeParse(client_request);
    if (!from_hub.success) {
      console.error("exact fields expected at this stage: :", from_hub.error);
      throw Error("Data should be clean at this stage.");
    }
    const { user_id } = client_request;
    const valid_payload = AddToRoomPayloadSchema.safeParse(
      from_hub.data.payload
    );
    if (!valid_payload.success) {
      console.log(
        "Invalid payload to add user received: ",
        from_hub.data.payload
      );
      return formatZodError([user_id], valid_payload.error);
    }
    const { user_to_add, room_id } = valid_payload.data;

    // Validate user id to add to add with auth
    if (room_id != this.room_id) {
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
            "A room by id " +
            room_id +
            " doesn't exist or user_id " +
            user_id +
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
          message: `User ${user_to_add} already in room ${this.room_name}.`,
        },
      };
    // import { db_interface_add_user } from "";

    // const query_result: Result = db_interface_add_user();
    // if (query_result.isErr)
    // ^ why am i not doing this?

    console.log("GETing HTTP: ", int_url.http.db.getUser, {
      userId: user_to_add,
    });
    const responseResult = await Containers.db.get(
      // getUser: "/internal_api/db/users/fetch/:userId"
      int_url.http.db.getUser,
      { userId: user_to_add }
    );

    // Check person is in friedn list possible here
    if (responseResult.isErr()) {
      {
        return {
          recipients: [user_id],
          funcId: "add_user_to_room",
          payload: {
            status: "THIS_MUST_BE_ERROR_RESPONSE_NOT_THIS_PAYLOAD",
            func_name: process.env.FUNC_POPUP_TEXT,
            pop_up_text: "No response for lookup on user id: ",
            user_to_add,
          },
        };
      }
    }
    const response = responseResult.unwrap();
    console.log("Response from db service:", response.status, response.data);

    if (response.status !== 200) {
      {
        {
          return {
            recipients: [user_id],
            funcId: "add_user_to_room",
            payload: {
              status: "oohh! aah!",
              func_name: process.env.FUNC_POPUP_TEXT,
              pop_up_text: "No user by that id.",
            },
          };
        }
      }
    }
    const valid_user_to_add = FullUser.safeParse(response?.data);
    if (!valid_user_to_add.success) {
      console.log("No known user with id ", user_to_add);
      return {
        recipients: [user_id],
        funcId: "add_user_to_room",
        payload: {
          status: httpStatus.BAD_REQUEST,
          func_name: process.env.FUNC_POPUP_TEXT,
          pop_up_text: `The user you requested (with id ${user_to_add}) doesn't exist.`,
        },
      };
    }
    const user = valid_user_to_add.data;
    const valid_user_is_adding = FullUser.safeParse(response?.data);
    if (!valid_user_is_adding.success) {
      console.log("No known user with id ", user_to_add);
      return {
        recipients: [user_id],
        funcId: "add_user_to_room",
        payload: {
          status: httpStatus.BAD_REQUEST,
          func_name: process.env.FUNC_POPUP_TEXT,
          pop_up_text: `The user you requested (with id ${user_to_add}) doesn't exist.`,
        },
      };
    }
    const userAdding = valid_user_is_adding.data;
    this.users.push(user.id);
    return {
      recipients: this.users,
      funcId: "add_user_to_room",
      payload: {
        status: httpStatus.OK,
        func_name: process.env.FUNC_ADD_MESSAGE_TO_ROOM,
        room_name: this.room_name,
        message: `User ${userAdding.alias} has added ${user.alias}`,
      },
    };
  }

  //////
  removeUser(user: any) {
    this.users = this.users.filter((u) => u !== user);
  }

  sendMessage(client_request: T_ForwardToContainer): T_PayloadToUsers {
    const from_hub = ForwardToContainerSchema.safeParse(client_request);
    if (!from_hub.success) {
      console.error("exact fields expected at this stage: :", from_hub.error);
      throw Error("Malformed message from hub.");
    }
    const user_id = from_hub.data.user_id;
    const valid_message_to_send = SendMessagePayloadSchema.safeParse(
      from_hub.data.payload
    );
    if (!valid_message_to_send.success) {
      console.log(
        "Invalid payload to add user received: ",
        from_hub.data.payload
      );
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
import type { ErrorResponseType } from "./utils/api/service/common/error.js";
import type { TypeRoomSchema } from "./utils/api/service/chat/db_models.js";
import { Result } from "./utils/api/service/common/result.js";
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

  getRoom(room_id: number): Result<TypeRoomSchema, ErrorResponseType> {
    const room = this.rooms.find((room) => {
      room_id === room.room_id;
    });
    if (room === undefined)
      return Result.Err({
        message: `No room with ID:'${room_id}' exists, or you are not in it.`,
      });
    return Result.Ok({ roomId: room.room_id, roomName: room.room_name });
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

  sendMessage(client_request: T_ForwardToContainer): T_PayloadToUsers {
    const from_hub = ForwardToContainerSchema.safeParse(client_request);
    if (!from_hub.success) {
      console.error("exact fields expected at this stage: :", from_hub.error);
      throw Error("Data should be clean at this stage.");
    }
    const { user_id } = client_request;
    if (!user_id) {
      throw Error("Service called with no user id behind it.");
    }
    const valid_payload = SendMessagePayloadSchema.safeParse(
      client_request.payload
    );
    if (!valid_payload.success) {
      return formatZodError([user_id], valid_payload.error);
    }
    let targetRoom = this.rooms.find(
      (room) => valid_payload.data.room_id === room.room_id
    );
    if (targetRoom == undefined)
      return {
        recipients: [user_id],
        funcId: "send_message_to_room",
        payload: {
          status: httpStatus.NOT_FOUND,
          func_name: process.env.FUNC_POPUP_TEXT,
          pop_up_text:
            "Room id " + valid_payload.data.room_id + " doesn't exist.",
        },
      };

    return targetRoom.sendMessage(client_request);
  }

  async addUserToRoom(
    client_request: T_ForwardToContainer
  ): Promise<T_PayloadToUsers> {
    const from_hub = ForwardToContainerSchema.safeParse(client_request);
    if (!from_hub.success) {
      console.error("exact fields expected at this stage: :", from_hub.error);
      throw Error("Data should be clean at this stage.");
    }
    const user_id = from_hub.data.user_id;
    const valid_payload = AddToRoomPayloadSchema.safeParse(
      client_request.payload
    );

    if (!valid_payload.success)
      return formatZodError([user_id], valid_payload.error);

    const requested_room_id = valid_payload.data.room_id;

    let targetRoom = this.rooms.find(
      (room) => requested_room_id === room.room_id
    );
    if (targetRoom && !targetRoom.users.includes(user_id)) {
      console.log(
        `DEBUG/WARN: user with id ${user_id} trying to send message to a room (${targetRoom.room_id}) they aren't in.`
      );
      // Will return error to client below.
    }
    if (targetRoom === undefined || !targetRoom.users.includes(user_id))
      return {
        recipients: [user_id],
        funcId: "add_user_to_room",
        payload: {
          status: httpStatus.NOT_FOUND,
          func_name: process.env.FUNC_POPUP_TEXT,
          pop_up_text: "Room with ID " + requested_room_id + " doesn't exist.",
        },
      };

    return await targetRoom.addUser(client_request);
  }
}

export default ChatRooms;
