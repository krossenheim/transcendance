const { MessageFromService } = require('/appservice/api_message.cjs');
const { g_myContainerName } = require('/appservice/container_names.cjs');
const { httpStatus } = require('/appservice/httpStatusEnum.cjs');
const { ErrorPayload } = require('/appservice/error_payload.cjs');

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

class Room {
	constructor(roomName) 
	{
		this.roomName = roomName;
		this.users = new Array();
		this.users.push("a","b","c"); // for testing
		this.messages = new FixedSizeList(20);
	}

	addUser(client_request) 
	{
		const userRequesting = client_request.clientID;
		const userToAdd = client_request.payload.userToAdd;
		if (!this.isUserInThisRoom(userRequesting))
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

	sendMessage(client_request)
	{
		// I'm having a brain fart about how these methods might be called from http or through websocket 
		// and what they should return.
		let payload;
		let messageFromService;
		if (!this.isUserInThisRoom(client_request.clientID))
		{
			payload = new ErrorPayload("User " + client_request.clientID+ " not in room " + this.roomName, null);
			messageFromService = new MessageFromService(httpStatus.BAD_REQUEST, [ client_request.clientID ], g_myContainerName, payload);
		}
		else 
		{
			payload = {payload: client_request.payload, illumination : "Happiness in the Kingdom, we speak the same language!", verySpecificField: "Very specific value", extraSpecificStuff: "Should remain safe to expose to users"};
			messageFromService = new MessageFromService(httpStatus.OK, this.users, g_myContainerName, payload);
		}
		return (messageFromService);
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

	addRoom(client_request)
	{
		const roomName = client_request.payload.roomName;
		if (!roomName)
			return (new MessageFromService(httpStatus.BAD_REQUEST, [ client_request.clientID ], g_myContainerName, new ErrorPayload("No room name given.", null)));
		let room = new Room(roomName);
		if (this.rooms && this.rooms.some(r => r.equals(room)))
			return (new MessageFromService(httpStatus.CONFLICT, [ client_request.clientID ], g_myContainerName, new ErrorPayload("Room already exists.", null)));
		room.users.push(client_request.clientID);
		this.rooms.push(room);
		const returnedMessageFromService = new MessageFromService(httpStatus.OK, [ client_request.clientID ], g_myContainerName, {"Success": "Room " + roomName + " created."})
		return (returnedMessageFromService);
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

	sendMessage(client_request)
	{
		const fromUser = client_request.clientID;
		const roomName = client_request.payload.roomName;
		const message = client_request.payload.messageSent;
		if (!fromUser || !roomName || !message)
			return (new MessageFromService(httpStatus.BAD_REQUEST, [], g_myContainerName, new ErrorPayload("Missing fromUser, roomName or messageSent argument.", null)));
		let targetRoom = this.rooms.find(room => roomName === room.roomName);
		if (targetRoom == undefined)
			return (new MessageFromService(httpStatus.NOT_FOUND, [], g_myContainerName, new ErrorPayload("Room " + roomName + " doesn't exist.", null)));
		return (targetRoom.sendMessage(client_request))
	}

	addUserToRoom(client_request)
	{
		const roomName = client_request.payload.roomName;	
		let targetRoom = this.rooms.find(room => roomName === room.roomName);
		if (targetRoom == undefined)
			return (new MessageFromService(httpStatus.NOT_FOUND, [], g_myContainerName, new ErrorPayload("Room " + roomName + " doesn't exist.", null)));
		return (targetRoom.addUser(client_request));
	}
}

module.exports = { ChatRooms };