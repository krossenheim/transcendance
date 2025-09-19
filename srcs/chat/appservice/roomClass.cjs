const { httpStatus } = require("/appservice/httpStatusEnum.cjs");
const { ErrorPayload } = require("/appservice/error_payload.cjs");

class FixedSizeList {
  constructor(maxSize = 10) {
    this.maxSize = maxSize;
    this.list = [];
  }

  add(item) {
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
  constructor(room_name) {
    this.room_name = room_name;
    this.users = new Array();
    this.users.push(); // for testing
    this.messages = new FixedSizeList(20);
    this.allowedUsers = new Array();
  }

  addUser(client_request) {
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
    if (!this.isUserInThisRoom(user_id)) {
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
          requestedroom +
          " doesn't exist or user_id " +
          room_name +
          "isnt in it.",
      };
    }
    if (this.isUserInThisRoom(added_user_id))
      return {
        status: httpStatus.ALREADY_REPORTED,
        recipients: [user_id],
        func_name: process.env.FUNC_POPUP_TEXT,
        room_name: this.room_name,
        message: `User ${added_user_id} already in room ${room_name}.`,
      };
    return {
      status: httpStatus.OK,
      recipients: this.users,
      func_name: process.env.FUNC_ADD_MESSAGE_TO_ROOM,
      room_name: this.room_name,
      message: `User ${user_id} has invited ${added_user_id}`,
    };
  }

  removeUser(user) {
    this.users = this.users.filter((u) => u !== user);
  }

  getUserCount() {
    return this.users.length;
  }

  isUserInThisRoom(user) {
    return this.users.includes(user);
  }

  sendMessage(client_request) {
    const { message, room_name, user_id } = client_request;
    if (!this.isUserInThisRoom(user_id)) {
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
          requestedroom +
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
        recipients: this.users,
        func_name: process.env.FUNC_ADD_MESSAGE_TO_ROOM,
        room_name: this.room_name,
        message: message,
      };
    }
  }

  equals(otherRoom) {
    return otherRoom && this.room_name == otherRoom.room_name;
  }
}

class ChatRooms {
  constructor() {
    if (ChatRooms.instance) {
      return ChatRooms.instance;
    }

    // Initialize your ChatRooms properties here
    this.rooms = new Array();

    // Cache the instance
    ChatRooms.instance = this;

    return this;
  }

  addRoom(client_request) {
    const { room_name, user_id } = client_request;
    if (!room_name)
      return {
        status: httpStatus.BAD_REQUEST,
        recipients: [user_id],
        func_name: process.env.FUNC_POPUP_TEXT,
        pop_up_text: "No room_name given.",
      };
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

  sendMessage(client_request) {
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

  addUserToRoom(client_request) {
    
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

module.exports = { ChatRooms };
