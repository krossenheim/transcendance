const { MessageFromService } = require('/appservice/api_message.cjs');
const { g_myContainerName } = require('/appservice/container_names.cjs');
const { httpStatus } = require('/appservice/httpStatusEnum.cjs');
class FixedSizeList {
	constructor(maxSize = 10) 
	{
		this.maxSize = maxSize;
		this.list = [];
	}

	add(item) 
	{
		this.list.push(item);

		if (this.list.length > this.maxSize) {
			this.list.shift();
		}
	}

	getList() 
	{
		return this.list;
	}
}

class Message
{
	#timestamp

	constructor(fromUser, toRoom, message_src) 
	{
		this.fromUser = fromUser
		this.roomName = toRoom;
		this.message_src = message_src;
		this.#timestamp = new Date().toISOString();
	}

	get timestamp()
	{
		return (this.#timestamp);
	}

	toString()
	{
		return ( "[" + this.timestamp + "] " + this.fromUser + ": " + this.message_src)
	}
	
}

class ErrorPayload
{
	constructor(textResponse, context)
	{
		this.textResponse = textResponse;
		this.context = context;
	}

	toJson()
	{
		return JSON.stringify({
			textResponse: this.textResponse,
			context: this.context
		});
	}
}

class Room {
	constructor(roomName) 
	{
		this.roomName = roomName;
		this.users = new Array();
		this.users.push("a","b","c"); // for testing
		this.messages = new FixedSizeList(20);
	}

	addUser(userRequestedBy, userToAdd) 
	{
		if (!this.isUserInThisRoom(userRequestedBy))
		{
			const payload = new ErrorPayload("User requestring to modify room is not in room.", null);
			return (new MessageFromService(httpStatus.UNAUTHORIZED, [ userRequestedBy ], g_myContainerName, payload));
		}
		this.users.push(userToAdd);
		const recipients = [ userToAdd, userRequestedBy];
		const payload = {
			userAdded: userToAdd,
			roomAddedTo: this.roomName,
			addedBy: userRequestedBy
		};
		//or(recipients, containerFrom, payload) 
		const added_ok = new MessageFromService(httpStatus.OK, recipients, g_myContainerName, payload);
		this.sendMessage(userRequestedBy, userRequestedBy + " added user " + userToAdd + " to the room.");
		return (added_ok);
	}

	removeUser(user) 
	{
		this.users = this.users.filter(u => u !== user);
	}

	getUserCount() 
	{
		return this.users.length;
	}

	// formatMessage(message_src)
	// {
	// 	const timestamp = new Date().toISOString();
	// 	const message = "[" + timestamp + "] " + this.fromUser + ": " + message_src;
	// 	return (message);
	// }

	payloadMessageUsers(fromUser, msg)
	{
		this.messages.add(msg);
		const recipients = this.users;
		const payload = {
			functionToExecute: "add_message_to_room",
			functionArguments: [ this.roomName, msg],
		};
		const newMessageFromService = new MessageFromService(httpStatus.OK, this.users, g_myContainerName, payload);
		return (newMessageFromService);
	}

	payloadUserNotInRoom(toUser)
	{
		const errorText = "Your username does not seem to be in room " + this.roomName + "' or the room doesn't exist."
		const payload = {
			recipients: [ toUser ],
			functionToExecute: "pop_up", // a function name also existing in the front end, like pop_up(which_element_id, message, ...); or error(message): {which_element_id id assigned here};
			functionArguments: [ errorText ],
		};
		const newMessageFromService = new MessageFromService(httpStatus.UNAUTHORIZED, [ toUser ], g_myContainerName, payload);
		return (newMessageFromService);
	}

	isUserInThisRoom(user)
	{
		return (this.users.includes(user));
	}

	sendMessage(fromUser, message_src)
	{
		// I'm having a brain fart about how these methods might be called from http or through websocket 
		// and what they should return.
		const internalMessageFromService = !this.isUserInThisRoom(fromUser) ? this.payloadUserNotInRoom(fromUser) :
			this.payloadMessageUsers(fromUser, new Message(fromUser, this.roomName, message_src).toString());;
		const jsonOut = JSON.stringify(internalMessageFromService);
		return (jsonOut);
	}

	equals(otherRoom)
	{
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
	constructor() 
	{
		if (ChatRooms.instance) {
			return ChatRooms.instance;
		}

		// Initialize your ChatRooms properties here
		this.rooms = new Array();

		// Cache the instance
		ChatRooms.instance = this;

		return this;
	}

	addRoom(clientRequest)
	{
		const roomName = clientRequest.payload.roomName;
		if (!roomName)
			return (new MessageFromService(httpStatus.BAD_REQUEST, [ clientRequest.clientID ], g_myContainerName, new ErrorPayload("No room name given.", null)));
		let room = new Room(roomName);
		if (this.rooms && this.rooms.some(r => r.equals(room)))
			return (new MessageFromService(httpStatus.CONFLICT, [ clientRequest.clientID ], g_myContainerName, new ErrorPayload("Room already exists.", null)));
		this.rooms.push(room);
		room.users.push(clientRequest.clientID);
		return (new MessageFromService(httpStatus.OK, [ clientRequest.clientID ], g_myContainerName, {"Success": "Room " + roomName + " created."}));
	}

	listRooms()
	{
		let returnedValues = [];

		for (const room of this.rooms) 
		{
			returnedValues.push(room.roomName);
		}	
		return returnedValues;
	}

	sendMessage(clientRequest)
	{
		const fromUser = clientRequest.payload.fromUser;
		const roomName = clientRequest.payload.roomName;
		const message = clientRequest.payload.messageSent;
		if (!fromUser || !roomName || !message)
			return (new MessageFromService(httpStatus.BAD_REQUEST, [], g_myContainerName, new ErrorPayload("Missing fromUser, roomName or messageSent argument.", null)));
		let targetRoom = this.rooms.find(room => roomName === room.roomName);
		if (targetRoom == undefined)
			return (new MessageFromService(httpStatus.NOT_FOUND, [], g_myContainerName, new ErrorPayload("Room " + roomName + " doesn't exist.", null)));
		return (targetRoom.sendMessage(fromUser, message));
	}

	addUserToRoom(clientRequest)
	{
		const userRequesting = clientRequest.payload.userRequesting;
		const roomName = clientRequest.payload.roomName;
		const userToAdd = clientRequest.payload.userToAdd;	
		let targetRoom = this.rooms.find(room => roomName === room.roomName);
		if (targetRoom == undefined)
			return (new MessageFromService(httpStatus.NOT_FOUND, [], g_myContainerName, new ErrorPayload("Room " + roomName + " doesn't exist.", null)));
		return (targetRoom.addUser(userRequesting, userToAdd));
	}
}

module.exports = { ChatRooms };