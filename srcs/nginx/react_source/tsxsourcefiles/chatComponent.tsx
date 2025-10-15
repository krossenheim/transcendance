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
    (room_id: string | number, messageString: string) => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        const payload = { room_id: room_id, messageString: messageString };
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
    (room_id: string, user_to_add: string) => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        const payload = { room_id, user_to_add };

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
