import type {
  TypeStoredMessageSchema,
  TypeListRoomsSchema,
  TypeRoomMessagesSchema,
  TypeRoomSchema,
} from "../../../nodejs_base_image/utils/api/service/chat/db_models";
import type { idValue } from "../../../nodejs_base_image/utils/api/service/common/zodRules";
import type { room_id_rule } from "../../../nodejs_base_image/utils/api/service/chat/chat_interfaces";
import React, { useCallback, useEffect, useState } from "react";
import { useWebSocket } from "./socketComponent";

export function ChatBox() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<string[]>([]);

  const handleSend = () => {
    if (!message.trim()) return;
    setMessages([...messages, message]);
    setMessage("");
  };

  return (
    <div className="w-full max-w-md flex flex-col bg-white shadow-lg rounded-2xl p-4 space-y-3 border border-gray-100">
      <h2 className="text-xl font-semibold text-center text-gray-800">
        ChatBox
      </h2>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto bg-gray-50 rounded-xl p-3 space-y-2 border border-gray-200 min-h-[200px]">
        {messages.length > 0 ? (
          messages.map((msg, i) => (
            <div
              key={i}
              className="bg-blue-100 text-gray-800 px-3 py-2 rounded-xl w-fit max-w-[80%] shadow-sm"
            >
              {msg}
            </div>
          ))
        ) : (
          <p className="text-gray-400 text-center text-sm italic">
            No messages yet
          </p>
        )}
      </div>

      {/* Message input */}
      <div className="flex space-x-2">
        <input
          type="text"
          placeholder="Type a message..."
          className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
        />
        <button
          onClick={handleSend}
          className="bg-blue-500 text-white px-4 py-2 rounded-full hover:bg-blue-600 active:scale-95 transition-all"
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default function PongComponent() {
  const { socket } = useWebSocket();
  const handleStoredMessageSchemaReceived = useCallback(
    (messageInfo: TypeStoredMessageSchema) => {
      console.log("Stored message received:", messageInfo);
    },
    []
  );

  const handleListRoomsSchemaReceived = useCallback(
    (rooms: TypeListRoomsSchema) => {
      rooms.forEach((room: TypeRoomSchema) => {
        console.log(`Room ID: ${room.roomId}, Name: ${room.roomName}`);
      });
    },
    []
  );

  const handleRoomMessagesSchemaReceived = useCallback(
    (messagesForRoom: TypeRoomMessagesSchema) => {
      console.log("Messages in room ID ", messagesForRoom.roomId);
      messagesForRoom.messages.forEach((message: TypeStoredMessageSchema) => {
        console.log(message);
      });
    },
    []
  );

  const handleSendSendMessagePayloadSchema = useCallback(
    // export const UserToHubSchema = z.object({
    //   target_container: z.string(),
    //   funcId: z.string(),
    //   payload: z.any(),
    // }).strict();
    (roomId: string | number, messageString: string) => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        const payload = { roomId: roomId, messageString: messageString };
        const toSend = {
          funcId: "/api/chat/send_message_to_room",
          payload: payload,
          target_container: "chat",
        };
        // window.sendFromContext(socket, "chat", "send_message_to_room", payload);
        socket.send(JSON.stringify(toSend));
      } else console.warn("WebSocket not open, cannot send message.");
    },
    [socket]
  );

  const handleSendInviteToRoomSchema = useCallback(
    (roomId: string, user_to_add: string) => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        const payload = { roomId, user_to_add };

        const toSend = {
          funcId: "/api/chat/add_to_room",
          payload: payload,
          target_container: "chat",
        };
        socket.send(JSON.stringify(toSend));
        console.log("Sent room invite:", toSend);
      } else console.warn("WebSocket not open, cannot invite user.");
    },
    [socket]
  );

  const handleSendAddRoomPayloadSchema = useCallback(
    (room_name: string) => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        const payload = { roomName: room_name };
        const toSend = {
          funcId: "/api/chat/add_a_new_room",
          payload: payload,
          target_container: "chat",
        };
        socket.send(JSON.stringify(toSend));
        console.log("Requested new room:", payload);
      } else console.warn("WebSocket not open, cannot create room.");
    },
    [socket]
  );

  // =========================
  // WebSocket routing
  // =========================
  useEffect(() => {
    if (!socket) return;

    const handleMessage = () => {
      const { payloadReceived } = useWebSocket();
      if (!payloadReceived) return;

      console.log(
        "Received:\nfuncID",
        payloadReceived.funcId,
        "\n",
        JSON.stringify(payloadReceived)
      );
      console.log("funcID:", payloadReceived.funcId);
      // console.log("Code:",payloadReceived.code);
      console.log("payload:", payloadReceived.funcId);

      switch (payloadReceived.funcId) {
        case "send_message":
          handleStoredMessageSchemaReceived(payloadReceived.payload);
          break;
        case "add_room":
          handleListRoomsSchemaReceived(payloadReceived.payload);
          break;
        case "add_user_to_room":
          handleRoomMessagesSchemaReceived(payloadReceived.payload);
          break;
        default:
          console.warn("Unknown funcId:", payloadReceived.funcId);
      }
    };

    socket.addEventListener("message", handleMessage);
    return () => socket.removeEventListener("message", handleMessage);
  }, [
    socket,
    handleStoredMessageSchemaReceived,
    handleListRoomsSchemaReceived,
    handleRoomMessagesSchemaReceived,
  ]);

  // =========================
  // Spruced-up UI with buttons
  // =========================
  const [roomIdInput, setRoomIdInput] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [newRoomName, setNewRoomName] = useState("");
  const [userToAdd, setUserToAdd] = useState("");

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4 space-y-4">
      <ChatBox /> 
      {/* PAss this component the messages to display */}

      <div className="w-full max-w-md shadow-lg p-6 rounded-2xl bg-white flex flex-col space-y-4">
        <h1 className="text-2xl font-bold text-center">ChatComponent</h1>
        <p className="text-center text-gray-500 text-sm">
          WebSocket connected:{" "}
          {socket?.readyState === WebSocket.OPEN ? "✅" : "❌"}
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
