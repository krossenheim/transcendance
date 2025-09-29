import {
  ForwardToContainerSchema,
  PayloadToUsersSchema,
} from "./utils/api/service/hub/hub_interfaces.js";

import {
  AddRoomSchema,
  AddUserToRoomPayloadSchema,
  SendMessageSchema,
  OutgoingMessageSchema,
} from "./utils/api/service/chat/chat_interfaces.js";
import httpStatus from "./utils/httpStatusEnum.js";
import { z } from "zod";
import { formatZodError } from "./utils/formatZodError.js";

function toInt(value: string) {
  const num = Number(value);
  if (!Number.isInteger(num)) {
    throw new TypeError(`Cannot convert "${value}" to integer`);
  }
  return num;
}

type T_ForwardToContainer = z.infer<typeof ForwardToContainerSchema>;
type T_PayloadToUsers = z.infer<typeof PayloadToUsersSchema>;
type T_OutgoingMessageSchema = z.infer<typeof OutgoingMessageSchema>;


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
//     room_name: roomNameRule,
//     message: messageRule,
// 	user_id: z.number().positive(),
// 	timestamp : z.number().positive(),
//   })
  // function composeOutgoing(user_id, room_name, message, timestamp) : T_OutgoingMessageSchema
  // {
	// const payload = {
  //       user_id: user_id,
  //       room_name: room_name,
  //       message: message,
	// 	timestamp: timestamp
  //     }
	//   return (payload);
  // }

class Room {
  public room_name: string;
  public users: Array<number>;
  public messages: FixedSizeList;
  public allowedUsers: Array<any>;

  constructor(room_name: string) {
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
    const validate_user_add = AddUserToRoomPayloadSchema.safeParse(
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
        payload: {
          status: httpStatus.ALREADY_REPORTED,
          func_name: process.env.FUNC_POPUP_TEXT,
          room_name: this.room_name,
          message: `User ${user_to_add} already in room ${room_name}.`,
        },
      };

    this.users.push(toInt(user_to_add));
    return {
      recipients: this.users,
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
	let payload ; 
    const validation = ForwardToContainerSchema.safeParse(client_request);
    if (!validation.success) {
      console.error("exact fields expected at this stage: :", validation.error);
      throw Error("Data should be clean at this stage.");
    }
    const { user_id } = client_request;
    const valid_message_to_send = SendMessageSchema.safeParse(
      client_request.payload
    );
    if (!valid_message_to_send.success) {
      return formatZodError([user_id], valid_message_to_send.error);
    }
    const { message, room_name } = client_request.payload;

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
        payload: {
          status: httpStatus.BAD_REQUEST,
          func_name: process.env.FUNC_POPUP_TEXT,
          pop_up_text:
            "Room " +
            room_name +
            " doesn't exist or user_id " +
            room_name +
            "isnt in it.",
        },
      };
    } else {
      console.log(
        `Userid ${user_id} joined room ${
          this.room_name
        }, request was: ${JSON.stringify(client_request)}`
      );
      return {
        recipients: this.users || [],
        payload: {
          status: httpStatus.OK,
          func_name: process.env.FUNC_ADD_MESSAGE_TO_ROOM,
          room_name: this.room_name,
          message: message,
        },
      };
    }
  }

  equals(otherRoom: Room) {
    return otherRoom && this.room_name == otherRoom.room_name;
  }
}

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

  addRoom(client_request: T_ForwardToContainer): T_PayloadToUsers {
    const validation = ForwardToContainerSchema.safeParse(client_request);
    if (!validation.success) {
      console.error("exact fields expected at this stage: :", validation.error);
      throw Error("Data should be clean at this stage.");
    }
    const user_id = client_request.user_id;
    if (!user_id) {
      throw Error("Service called with no user id behind it.");
    }
    const valid_add_room_schema = AddRoomSchema.safeParse(
      client_request.payload
    );
    if (!valid_add_room_schema.success) {
      return formatZodError([user_id], valid_add_room_schema.error);
    }
    const { room_name } = client_request.payload;
    let room = new Room(room_name);
    if (this.rooms && this.rooms.some((r) => r.equals(room)))
      return {
        recipients: [user_id],
        payload: {
          status: httpStatus.ALREADY_REPORTED,
          func_name: process.env.FUNC_POPUP_TEXT,
          pop_up_text: "Room already exists.",
        },
      };
    room.users.push(user_id);
    room.allowedUsers.push(user_id);
    this.rooms.push(room);
    return {
      recipients: [user_id],
      payload: {
        status: httpStatus.OK,
        func_name: process.env.FUNC_ADDED_ROOM_SUCCESS,
        room_name: room.room_name,
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
		if (user_id in room.users)
		{
			list.push(room.room_name);
		}
    }
    return {
        recipients: [user_id],
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
    const { room_name } = client_request.payload;
    if (!user_id) {
      throw Error("Service called with no user id behind it.");
    }
    const validate_message = SendMessageSchema.safeParse(
      client_request.payload
    );
    if (!validate_message.success) {
      return formatZodError([user_id], validate_message.error);
    }
    let targetRoom = this.rooms.find((room) => room_name === room.room_name);
    if (targetRoom == undefined)
      return {
        recipients: [user_id],
        payload: {
          status: httpStatus.NOT_FOUND,
          func_name: process.env.FUNC_POPUP_TEXT,
          pop_up_text: "Room " + room_name + " doesn't exist.",
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
    const valid_user_to_room_request = AddUserToRoomPayloadSchema.safeParse(
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
