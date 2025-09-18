const { MessageFromService } = require("/appservice/api_message.cjs");
// const { null } = require('/appservice/container_names.cjs');
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
  constructor(roomName) {
    this.roomName = roomName;
    this.users = new Array();
    this.users.push(); // for testing
    this.messages = new FixedSizeList(20);
    this.allowedUsers = new Array();
  }

  addUser(client_request) {
    const userRequesting = client_request.user_id;
    const userToAdd = client_request.payload.userToAdd;
    if (!this.isUserInThisRoom(userRequesting)) {
      const payload = new ErrorPayload(
        "User requesting to modify room is not in room.",
        null
      );
      return new MessageFromService(
        httpStatus.UNAUTHORIZED,
        [userRequesting],
        client_request.endpoint,
        payload
      );
    }
    if (this.isUserInThisRoom(userToAdd)) {
      return new MessageFromService(
        httpStatus.ALREADY_REPORTED,
        [userRequesting],
        client_request.endpoint,
        { error  : 'Already in room; user_id: '+ userToAdd}
      );
    }
    this.users.push(userToAdd);
    const recipients = this.users;
    const payload = {
      userAdded: userToAdd,
      roomAddedTo: this.roomName,
      addedBy: userRequesting,
    };
    //or(recipients, containerFrom, payload)
    const added_ok = new MessageFromService(
      httpStatus.OK,
      recipients,
      client_request.endpoint,
      payload
    );
    return added_ok;
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
    // I'm having a brain fart about how these methods might be called from http or through websocket
    // and what they should return.
    let payload;
    let messageFromService;
    if (!this.isUserInThisRoom(client_request.user_id)) {
      messageFromService = new MessageFromService(
        httpStatus.BAD_REQUEST,
        [client_request.user_id],
        client_request.endpoint,
        new ErrorPayload(
          "User " + client_request.user_id + " not in room " + this.roomName,
          null
        )
      );
    } else {
      messageFromService = new MessageFromService(
        httpStatus.OK,
        this.users,
        client_request.endpoint,
        client_request.payload
      );
    }
    return messageFromService;
  }

  equals(otherRoom) {
    return otherRoom && this.roomName == otherRoom.roomName;
  }
}

// const tasks = {
//   'ADD_A_NEW_ROOM': {
//     url: '/api/new_room',
//     handler: singletonChatRooms.addRoom,
//     method: 'POST',
//   },
//   'LIST_ROOMS': {
//     url: '/api/list_rooms',
//     handler: singletonChatRooms.listRooms,
//     method: 'GET',
//   },
//   'SEND_MESSAGE_TO_ROOM': {
//     url: '/api/send_message_to_room',
//     handler: singletonChatRooms.sendMessage,
//     method: 'POST',
//   },
//   'ADD_USER_TO_ROOM': {
//     url: '/api/add_to_room',
//     handler: singletonChatRooms.addUserToRoom,
//     method: 'POST',
//   },
// };
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
    const roomName = client_request.payload.roomName;
    if (!roomName)
      return new MessageFromService(
        httpStatus.BAD_REQUEST,
        [client_request.user_id],
        client_request.endpoint,
        new ErrorPayload("No room name given.", null)
      );
    let room = new Room(roomName);
    if (this.rooms && this.rooms.some((r) => r.equals(room)))
      return new MessageFromService(
        httpStatus.CONFLICT,
        [client_request.user_id],
        client_request.endpoint,
        new ErrorPayload("Room already exists.", null)
      );
    room.users.push(client_request.user_id);
    room.allowedUsers.push(client_request.user_id);
    this.rooms.push(room);
    const returnedMessageFromService = new MessageFromService(
      httpStatus.OK,
      [client_request.user_id],
      client_request.endpoint,
      { Success: "Room " + roomName + " created." }
    );
    return returnedMessageFromService;
  }

  listRooms() {
    let returnedValues = [];

    for (const room of this.rooms) {
      returnedValues.push(room.roomName);
    }
    return returnedValues;
  }

  sendMessage(client_request) {
    const fromUser = client_request.user_id;
    const roomName = client_request.payload.roomName;
    const message = client_request.payload.messageSent;
    if (!fromUser || !roomName || !message)
      return new MessageFromService(
        httpStatus.BAD_REQUEST,
        [client_request.user_id],
        client_request.endpoint,
        new ErrorPayload(
          "Missing fromUser, roomName or messageSent argument.",
          null
        )
      );
    let targetRoom = this.rooms.find((room) => roomName === room.roomName);
    if (targetRoom == undefined)
      return new MessageFromService(
        httpStatus.NOT_FOUND,
        [client_request.user_id],
        client_request.endpoint,
        new ErrorPayload("Room " + roomName + " doesn't exist.", null)
      );
    return targetRoom.sendMessage(client_request);
  }

  addUserToRoom(client_request) {
    const roomName = client_request.payload.roomName;
    let targetRoom = this.rooms.find((room) => roomName === room.roomName);
    if (targetRoom == undefined)
      return new MessageFromService(
        httpStatus.NOT_FOUND,
        [client_request.user_id],
        client_request.endpoint,
        new ErrorPayload("Room " + roomName + " doesn't exist.", null)
      );
    return targetRoom.addUser(client_request);
  }
}

module.exports = { ChatRooms };
