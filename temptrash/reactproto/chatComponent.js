function ChatComponent({ webSocket }) {
  // =========================
  // Incoming message handlers
  //   // =========================
  //  message_id: id_rule,
  //     roomId: room_id_rule,
  //     messageString: message_rule,
  //     messageDate: message_date_rule,
  //     userId: id_rule,
  const handleStoredMessageSchemaReceived = React.useCallback(
    (typeStoredMessageSchema) => {
      console.log("Stored message received:", data);
    },
    []
  );

  const handleListRoomsSchemaReceived = React.useCallback((data) => {
    console.log("Available rooms:", data);
  }, []);

  // export const RoomMessagesSchema = z
  //   .object({
  //     roomId: room_id_rule,
  //     messages: z.array(StoredMessageSchema),
  //   })
  //   .strict();

  const handleRoomMessagesSchemaReceived = React.useCallback((fufu) => {
    console.log(`Messages for room ${data.roomId}:`, data.messages);
  }, []);

  // =========================
  // Outgoing message handlers
  // =========================
  // export const SendMessagePayloadSchema = z
  //   .object({
  //   // Payload sent by client "send message to room"
  //     roomId: room_id_rule,
  //     messageString: message_rule,
  //   })
  //   .strict();

  const handleSendSendMessagePayloadSchema = React.useCallback(
    // export const UserToHubSchema = z.object({
    //   target_container: z.string(),
    //   funcId: z.string(),
    //   payload: z.any(),
    // }).strict();
    (roomId, messageString) => {
      if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        const payload = { roomId: roomId, messageString: messageString };
        const toSend = {
          funcId: "/api/chat/send_message_to_room",
          payload: payload,
          target_container: "chat",
        };
        // window.sendFromContext(webSocket, "chat", "send_message_to_room", payload);
        webSocket.send(JSON.stringify(toSend));
      } else console.warn("WebSocket not open, cannot send message.");
    },
    [webSocket]
  );

  const handleSendInviteToRoomSchema = React.useCallback(
    (roomId, user_to_add) => {
      if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        const payload = { roomId, user_to_add };

        const toSend = {
          funcId: "/api/chat/add_to_room",
          payload: payload,
          target_container: "chat",
        };
        webSocket.send(JSON.stringify(toSend));
        console.log("Sent room invite:", toSend);
      } else console.warn("WebSocket not open, cannot invite user.");
    },
    [webSocket]
  );

  const handleSendAddRoomPayloadSchema = React.useCallback(
    (room_name) => {
      if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        const payload = { roomName: room_name };
        const toSend = {
          funcId: "/api/chat/add_a_new_room",
          payload: payload,
          target_container: "chat",
        };
        webSocket.send(JSON.stringify(toSend));
        console.log("Requested new room:", payload);
      } else console.warn("WebSocket not open, cannot create room.");
    },
    [webSocket]
  );

  // =========================
  // WebSocket routing
  // =========================
  React.useEffect(() => {
    if (!webSocket) return;

    //  funcId: "/api/chat/add_a_new_room",
    // LIST_ROOMS: {
    //   funcId: "/api/chat/list_rooms",
    // },
    // SEND_MESSAGE_TO_ROOM: {
    //   funcId: "/api/chat/send_message_to_room",
    // },
    // ADD_USER_TO_ROOM: {
    //   funcId: "/api/chat/add_to_room",

    // export const ListRoomsSchema = z
    //   .array(z.object({
    //   // To client when asnwering 'Give my list of rooms'
    //   // chat validates user in z.users (No field for user id here, its set by hub)
    //     roomId: room_id_rule,
    //     room_name: room_name_rule,
    //   }).strict());
    //   [{roomId:888,room_name:

    //   }]
    // export const PayloadHubToUsersSchema = z.object({
    //   source_container: z.string(),
    //   funcId: z.string(),
    //   payload: z.any(),
    // }).strict();

    const handleMessage = (event) => {
      try {
        // event.data PayloadHubToUsersSchema
        const data = JSON.parse(event.data);
        if (data.source_container != "chat") return;
        console.log("received", JSON.stringify(data));
        switch (data.funcId) {
          case "send_message":
            handleStoredMessageSchemaReceived(data.payload);
            break;
          case "add_room":
            handleListRoomsSchemaReceived(data.payload);
            break;
          case "add_user_to_room":
            handleRoomMessagesSchemaReceived(data.payload);
            break;
          default:
            console.warn("Unknown funcId:", data.funcId);
        }
      } catch (err) {
        console.log(
          "Invalid message format:",
          err,
          " message was\n",
          event.data
        );
      }
    };

    webSocket.addEventListener("message", handleMessage);
    return () => webSocket.removeEventListener("message", handleMessage);
  }, [
    webSocket,
    handleStoredMessageSchemaReceived,
    handleListRoomsSchemaReceived,
    handleRoomMessagesSchemaReceived,
  ]);

  // =========================
  // Spruced-up UI with buttons
  // =========================
  const [roomIdInput, setRoomIdInput] = React.useState("");
  const [messageInput, setMessageInput] = React.useState("");
  const [newRoomName, setNewRoomName] = React.useState("");
  const [userToAdd, setUserToAdd] = React.useState("");

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4 space-y-4">
      <div className="w-full max-w-md shadow-lg p-6 rounded-2xl bg-white flex flex-col space-y-4">
        <h1 className="text-2xl font-bold text-center">ChatComponent</h1>
        <p className="text-center text-gray-500 text-sm">
          WebSocket connected:{" "}
          {webSocket?.readyState === WebSocket.OPEN ? "✅" : "❌"}
        </p>

        {/* Send Message */}
        <div className="flex flex-col space-y-2">
          <input
            type="text"
            placeholder="Room ID"
            value={roomIdInput}
            onChange={(e) => setRoomIdInput(e.target.value)}
            className="border rounded px-2 py-1"
          />
          <input
            type="text"
            placeholder="Message"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            className="border rounded px-2 py-1"
          />
          <button
            onClick={() =>
              handleSendSendMessagePayloadSchema(roomIdInput, messageInput)
            }
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            Send Message
          </button>
        </div>

        {/* Add to Room */}
        <div className="flex flex-col space-y-2">
          <input
            type="text"
            placeholder="Room ID"
            value={roomIdInput}
            onChange={(e) => setRoomIdInput(e.target.value)}
            className="border rounded px-2 py-1"
          />
          <input
            type="text"
            placeholder="User ID to Add"
            value={userToAdd}
            onChange={(e) => setUserToAdd(e.target.value)}
            className="border rounded px-2 py-1"
          />
          <button
            onClick={() => handleSendInviteToRoomSchema(roomIdInput, userToAdd)}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
          >
            Add User to Room
          </button>
        </div>

        {/* Create Room */}
        <div className="flex flex-col space-y-2">
          <input
            type="text"
            placeholder="New Room Name"
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            className="border rounded px-2 py-1"
          />
          <button
            onClick={() => handleSendAddRoomPayloadSchema(newRoomName)}
            className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600"
          >
            Create Room
          </button>
        </div>
      </div>
    </div>
  );
}

window.ChatComponent = ChatComponent;
