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
		this.users = [];
		this.messages = new FixedSizeList(20);
	}

	addUser(userRequestedBy, userToAdd) 
	{
		this.users.push(userToAdd);
	}

	removeUser(user) 
	{
		this.users = this.users.filter(u => u !== user);
	}

	getUserCount() 
	{
		return this.users.length;
	}

	sendMessage(from, message)
	{
		message_list = [];
		message = "[" + new Date.now().toISOString() + "]" + from + ": " + message;
		this.messages.add(message);
		for (const user of this.users) 
		{
			message_list.push(user + ":" + this.roomName + ":" + message);
		}
		
		const payload = {
			list: message_list
		};

		const json = JSON.stringify(payload);

		return (json);
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

	sendMessage(from, roomName, message)
	{
		let targetRoom = this.rooms.find(room => roomName === room.roomName);
		if (targetRoom == undefined)
			return "Error: Room " +roomName + " doesnt exist";
		return (targetRoom.sendMessage(from, message));
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