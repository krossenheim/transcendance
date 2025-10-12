
const chat_ws = 
{
	addRoom : "add_a_new_room",
	listRooms: "list_rooms",
    sendMessageToRoom: "send_message_to_room",
    addUserToRoom: "add_to_room",
}

const pong_ws = {};

const auth_http = {

}

const db_http = {
	createChatRoom : `/chat/rooms/${chat_ws.addRoom}`,
}

export const endpoints =
{
	ws : {	chat : chat_ws, pong : pong_ws},
	http : { db: db_http},
}
