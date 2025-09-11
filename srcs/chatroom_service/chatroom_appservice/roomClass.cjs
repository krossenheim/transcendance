const { ApiMessage } = require('/appservice/api_message.cjs');
const { g_myContainerName } = require('/appservice/get_this_container_name.cjs');

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

// class Message
// {
// 	#timestamp

// 	constructor(fromUser, toRoom, message_src) 
// 	{
// 		this.fromUser = fromUser
// 		this.roomName = toRoom;
// 		this.message_src = message_src;
// 		this.#timestamp = new Date().toISOString();
// 	}

// 	get timestamp()
// 	{
// 		return (this.#timestamp);
// 	}

// 	toString()
// 	{
// 		return ( "[" + this.timestamp + "] " + fromUser + ": " + message_src)
// 	}
	
// }

class Room {
	constructor(roomName) 
	{
		this.roomName = roomName;
		this.users = [];
		this.messages = new FixedSizeList(20);
	}

	addUser(userRequestedBy, userToAdd) 
	{
		this.users.push(userToAdd);
		const payload = {
			title: "Succesfully added user.",
			usedAdded: userToAdd,
			roomAddedTo: this.roomName,
			addedBy: userRequestedBy
		};
		const added_ok = new ApiMessage("Success", "chatroom_service", "External-Client", userRequestedBy, payload);
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

	payloadMessageUsers(fromUser, msg)
	{
		this.messages.add(msg);
		const payload = {
			recipients: this.users,
			functionToExecute: "add_message_to_room",
			functionArguments: [ this.roomName, msg],
		};
		for (const recipient of this.users) 
		{
			payload.recipients.push(recipient);
		}
		const newApiMessage = new ApiMessage("Success", g_myContainerName, "External-Client", fromUser, payload);
		return (newApiMessage);
	}

	payloadUserNotInRoom(toUser)
	{
		const errorText = "Your username does not seem to be in room " + this.roomName + "' or the room doesn't exist."
		const payload = {
			recipients: [ toUser ],
			functionToExecute: "pop_up", // a function name also existing in the front end, like pop_up(which_element_id, message, ...); or error(message): {which_element_id id assigned here};
			functionArguments: [ errorText ],
		};
		const newApiMessage = new ApiMessage("Error", g_myContainerName, "External-Client", toUser, payload);
		return (newApiMessage);
	}

	userInThisRoom(user)
	{
		return (this.users.includes(user));
	}

	sendMessage(fromUser, message_src)
	{
		if (this.userInThisRoom(fromUser))
		{
			const internalApiMessage = payloadMessageUsers(fromUser, new Message(fromUser, this.roomName, message_src).toString());
			sendThroughWebsocket(internalApiMessage);
		}
	}

	equals(otherRoom)
	{
		return otherRoom && this.roomName == otherRoom.roomName;
	}
}

class ChatRooms {
	constructor() 
	{
		if (ChatRooms.instance) {
			return ChatRooms.instance;
		}

		// Initialize your ChatRooms properties here
		this.rooms = []

		// Cache the instance
		ChatRooms.instance = this;

		return this;
	}

	addRoom(roomName)
	{
		if (!roomName)
			return ("Error: No room name given.");
		let room = new Room(roomName);
		if (this.rooms.some(r => r.equals(room)))
			return ("Error: room already exists");
		this.rooms.push(room);
		return ("OK: Room made");
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

	userIsInRoom(user, room)
	{
		if (!room.users.includes(user))
		{
			return (false);
		}
		return (true);
	}

	sendMessage(fromUser, roomName, message)
	{
		let targetRoom = this.rooms.find(room => roomName === room.roomName);
		if (targetRoom == undefined)
			return "Error: Room " +roomName + " doesnt exist";
		if (!this.userIsInRoom(userRequesting, targetRoom))
		{
			return {Error: }
		}
		return (targetRoom.sendMessage(fromUser, message));
	}

	addUserToRoom(userRequesting, roomName, userToAdd)
	{
		let targetRoom = this.rooms.find(room => roomName === room.roomName);
		if (targetRoom == undefined)
			return "Error: Room " +roomName + " doesnt exist";
		return (targetRoom.addUser(userRequesting, userToAdd));
	}
}

module.exports = { ChatRooms };