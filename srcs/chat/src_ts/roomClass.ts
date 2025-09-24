import { ForwardToContainerSchema } from "./utils/api/service/hub_interfaces.js";
import httpStatus from "./utils/httpStatusEnum.js";
import z from 'zod';

function toInt(value : string) {
  const num = Number(value);
  if (!Number.isInteger(num)) {
    throw new TypeError(`Cannot convert "${value}" to integer`);
  }
  return num;
}

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
	public users: Array<number>;
	public messages: FixedSizeList;
	public allowedUsers: Array<any>;

  constructor(room_name: string) {
    this.room_name = room_name;
    this.users = new Array();
    this.messages = new FixedSizeList(20);
    this.allowedUsers = new Array();
  }

  addUser(client_request: any) {
    const { user_id, added_user_id, room_name } = client_request;
    if (!user_id) {
      throw new Error(
        `No user_id, request was: ${JSON.stringify(client_request)}`
      );
    }
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

    if (!added_user_id || added_user_id === user_id) {
      console.log(
        `missing or bad added_user_id, request was: ${JSON.stringify(client_request)}`
      );
      return {
        status: httpStatus.BAD_REQUEST,
        recipients: [user_id],
        func_name: process.env.FUNC_POPUP_TEXT,
        pop_up_text: "No or bad added_user_id field found",
      };
    }
    if (!this.users.includes(user_id)) {
      console.log(
        `Userid ${user_id} is not in room ${
          this.room_name
        }, request was: ${JSON.stringify(client_request)}`
      );
      return {
        status: httpStatus.BAD_REQUEST,
        recipients: [user_id],
        func_name: process.env.FUNC_POPUP_TEXT,
        pop_up_text:
          "Room " +
          room_name +
          " doesn't exist or user_id " +
          room_name +
          "isnt in it.",
      };
    }
    if (this.users.includes(added_user_id))
      return {
        status: httpStatus.ALREADY_REPORTED,
        recipients: [user_id],
        func_name: process.env.FUNC_POPUP_TEXT,
        room_name: this.room_name,
        message: `User ${added_user_id} already in room ${room_name}.`,
      };
    this.users.push(toInt(added_user_id));
    return {
      status: httpStatus.OK,
      recipients: this.users,
      func_name: process.env.FUNC_ADD_MESSAGE_TO_ROOM,
      room_name: this.room_name,
      message: `User ${user_id} has added ${added_user_id}`,
    };
  }

  removeUser(user: any) {
    this.users = this.users.filter((u) => u !== user);
  }

  sendMessage(client_request : any) {
    const { message, room_name, user_id } = client_request;
    if (!this.users.includes(user_id)) {
      console.log(
        `Userid ${user_id} is not in room ${
          this.room_name
        },users in it are: [${this.users.join(', ')}], request was: ${JSON.stringify(client_request)}`
      );
      return {
        status: httpStatus.BAD_REQUEST,
        recipients: [user_id],
        func_name: process.env.FUNC_POPUP_TEXT,
        pop_up_text:
          "Room " +
          room_name +
          " doesn't exist or user_id " +
          room_name +
          "isnt in it.",
      };
    } else {
      console.log(
        `Userid ${user_id} joined room ${
          this.room_name
        }, request was: ${JSON.stringify(client_request)}`
      );
      return {
        status: httpStatus.OK,
        recipients: this.users || [],
        func_name: process.env.FUNC_ADD_MESSAGE_TO_ROOM,
        room_name: this.room_name,
        message: message,
      };
    }
  }

  equals(otherRoom : any) {
    return otherRoom && this.room_name == otherRoom.room_name;
  }
}

type T_ForwardToContainer = z.infer<typeof ForwardToContainerSchema>;

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


  addRoom(forwarded : T_ForwardToContainer) {
    const validation = ForwardToContainerSchema.safeParse(forwarded);
    if (!validation.success)
    {
      console.log("Received invalid arguments to add room.")
      return ;
    }
    const { room_name } = forwarded.payload;
    const user_id  = forwarded.user_id;
    if (!room_name)
    {
      throw Error("Should be zod validated already.");
    }
    let room = new Room(room_name);
    if (this.rooms && this.rooms.some((r) => r.equals(room)))
      return {
        status: httpStatus.ALREADY_REPORTED,
        recipients: [user_id],
        func_name: process.env.FUNC_POPUP_TEXT,
        pop_up_text: "Room already exists.",
      };
    room.users.push(user_id);
    room.allowedUsers.push(user_id);
    this.rooms.push(room);
    return {
      status: httpStatus.OK,
      recipients: [user_id],
      func_name: process.env.FUNC_ADDED_ROOM_SUCCESS,
      room_name: room.room_name,
    };
  }

  listRooms() {
    let returnedValues = [];

    for (const room of this.rooms) {
      returnedValues.push(room.room_name);
    }
    return returnedValues;
  }

  sendMessage(client_request : any) {
    const { user_id, room_name, message } = client_request;
    if (!user_id || !room_name || !message) {
      console.error("request missing fields, request was:" + client_request);
      return;
    }
    let targetRoom = this.rooms.find((room) => room_name === room.room_name);
    if (targetRoom == undefined)
      return {
        status: httpStatus.NOT_FOUND,
        recipients: [user_id],
        func_name: process.env.FUNC_POPUP_TEXT,
        pop_up_text: "Room " + room_name + " doesn't exist.",
      };

    return targetRoom.sendMessage(client_request);
  }

  addUserToRoom(client_request : any) {
    
    const {user_id, room_name} = client_request;
    if (!user_id)
    {
      throw new Error("No userid for request");
    }
    let targetRoom = this.rooms.find((room) => room_name === room.room_name);
    if (targetRoom == undefined)
      return {
        status: httpStatus.NOT_FOUND,
        recipients: [user_id],
        func_name: process.env.FUNC_POPUP_TEXT,
        pop_up_text: "Room " + room_name + " doesn't exist.",
      };

    return targetRoom.addUser(client_request);
  }
}

export default ChatRooms ;
