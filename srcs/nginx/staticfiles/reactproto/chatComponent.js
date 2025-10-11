function ChatComponent({ webSocket }) {
  // =========================
  // Incoming message handlers
  // =========================

  const handleStoredMessageSchemaReceived = React.useCallback((data) => {
    console.log("Stored message received:", data);
  }, []);

  const handleListRoomsSchemaReceived = React.useCallback((data) => {
    console.log("Available rooms:", data);
  }, []);

  const handleRoomMessagesSchemaReceived = React.useCallback((data) => {
    console.log(`Messages for room ${data.room_id}:`, data.messages);
  }, []);

  // =========================
  // Outgoing message handlers
  // =========================

  const handleSendSendMessagePayloadSchema = React.useCallback(
    (room_id, messageString) => {
      if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        const payload = { room_id, messageString };
        window.sendFromContext(webSocket, "chat", "sendMessage", payload);
        // webSocket.send(JSON.stringify(payload));
      } else console.warn("WebSocket not open, cannot send message.");
    },
    [webSocket]
  );

  const handleSendInviteToRoom = React.useCallback(
    (room_id, user_to_add) => {
      if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        const payload = {
          type: "add_to_room",
          payload: { room_id, user_to_add },
        };
        webSocket.send(JSON.stringify(payload));
        console.log("Sent room invite:", payload);
      } else console.warn("WebSocket not open, cannot invite user.");
    },
    [webSocket]
  );

  const handleSendAddRoomPayloadSchema = React.useCallback(
    (room_name) => {
      if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        const payload = { type: "add_room", payload: { room_name } };
        webSocket.send(JSON.stringify(payload));
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

    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case "stored_message":
            handleStoredMessageSchemaReceived(data);
            break;
          case "list_rooms":
            handleListRoomsSchemaReceived(data);
            break;
          case "room_messages":
            handleRoomMessagesSchemaReceived(data);
            break;
          default:
            console.warn("Unknown message type:", data.type);
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
        <h1 className="text-2xl font-bold text-center">Chat</h1>
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
            onClick={() => handleSendInviteToRoom(roomIdInput, userToAdd)}
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
