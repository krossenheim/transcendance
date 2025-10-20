import type {
  TypeStoredMessageSchema,
  TypeListRoomsSchema,
  TypeRoomMessagesSchema,
  TypeRoomSchema,
} from "../../../nodejs_base_image/utils/api/service/chat/db_models";
import type { idValue } from "../../../nodejs_base_image/utils/api/service/common/zodRules";
import type { room_id_rule } from "../../../nodejs_base_image/utils/api/service/chat/chat_interfaces";
import React, { useCallback, useEffect, useState } from "react";
import { ChatBox } from "./chatBoxComponent";
import { user_url } from "../../../nodejs_base_image/utils/api/service/common/endpoints";
import { useWebSocket } from "./socketComponent";

export default function ChatInputComponent() {
  const { socket, payloadReceived } = useWebSocket();

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
    (roomId: string | number, messageString: string) => {
      if (socket.current && socket.current.readyState === WebSocket.OPEN) {
        const payload = { roomId: roomId, messageString: messageString };
        const toSend = {
          funcId: user_url.ws.chat.sendMessage.funcId,
          payload: payload,
          target_container: "chat",
        };
        // window.sendFromContext(socket.current, "chat", "send_message_to_room", payload);
        socket.current.send(JSON.stringify(toSend));
      } else console.warn("WebSocket not open, cannot send message.");
    },
    []
  );

  const handleSendInviteToRoomSchema = useCallback(
    (roomId: string, user_to_add: string) => {
      if (socket.current && socket.current.readyState === WebSocket.OPEN) {
        const payload = { roomId, user_to_add };

        const toSend = {
          funcId: user_url.ws.chat.addUserToRoom.funcId,
          payload: payload,
          target_container: "chat",
        };
        socket.current.send(JSON.stringify(toSend));
        console.log("Sent room invite:", toSend);
      } else console.warn("WebSocket not open, cannot invite user.");
    },
    []
  );

  const handleSendAddRoomPayloadSchema = useCallback((room_name: string) => {
    if (socket.current && socket.current.readyState === WebSocket.OPEN) {
      const payload = { roomName: room_name };
      const toSend = {
        funcId: user_url.ws.chat.addRoom.funcId,
        payload: payload,
        target_container: "chat",
      };
      socket.current.send(JSON.stringify(toSend));
      console.log("Requested new room:", payload);
    } else console.warn("WebSocket not open, cannot create room.");
  }, []);

  const handleSendRequestRoomList = useCallback(() => {
    if (socket.current && socket.current.readyState === WebSocket.OPEN) {
      const toSend = {
        funcId: user_url.ws.chat.listRooms.funcId,
        payload: {},
        target_container: "chat",
      };
      socket.current.send(JSON.stringify(toSend));
      console.log("Requested room list");
    } else console.warn("WebSocket not open, cannot request list of rooms.");
  }, []);

  const handleSendRequestJoinRoom = useCallback((room_id: string) => {
    if (socket.current && socket.current.readyState === WebSocket.OPEN) {
      const toSend = {
        funcId: user_url.ws.chat.joinRoom.funcId,
        payload: { roomId: room_id },
        target_container: "chat",
      };
      socket.current.send(JSON.stringify(toSend));
      console.log("Requested room list");
    } else console.warn("WebSocket not open, cannot request list of rooms.");
  }, []);

  // =========================
  // WebSocket routing
  // =========================
  useEffect(() => {
    if (!socket.current) return;

    const handleMessage = () => {
      if (!payloadReceived) return;

      console.log(
        "Received:\nfuncID",
        payloadReceived.funcId,
        "\n",
        JSON.stringify(payloadReceived)
      );
      console.log("funcID:", payloadReceived.funcId);
      console.log("payload:", payloadReceived.funcId);
      switch (payloadReceived.funcId) {
        // None of these are real rn.
        case user_url.ws.chat.sendMessage.funcId:
          handleStoredMessageSchemaReceived(payloadReceived.payload);
          break;
        case user_url.ws.chat.listRooms.funcId:
          handleListRoomsSchemaReceived(payloadReceived.payload);
          break;
        case user_url.ws.chat.addUserToRoom.funcId:
          handleRoomMessagesSchemaReceived(payloadReceived.payload);
          break;
        case user_url.ws.chat.joinRoom.funcId:
          handleSendRequestJoinRoom(payloadReceived.payload);
          break;
        default:
          console.warn("Unknown funcId:", payloadReceived.funcId);
      }
    };

    socket.current.addEventListener("message", handleMessage);
    return () => {
      if (socket.current)
        socket.current.removeEventListener("message", handleMessage);
    };
  }, [
    handleStoredMessageSchemaReceived,
    handleListRoomsSchemaReceived,
    handleRoomMessagesSchemaReceived,
    
  ]);

  // =========================
  // Spruced-up UI with buttons
  // =========================
  const [roomIdInput, setRoomIdInput] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [roomIdToJoin, setRoomIdToJoin] = useState("");
  const [newRoomName, setNewRoomName] = useState("");
  const [userToAdd, setUserToAdd] = useState("");

  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4 space-y-4">
        {/* PAss this component the messages to display */}

        <div className="w-full max-w-md shadow-lg p-6 rounded-2xl bg-white flex flex-col space-y-4">
          <h1 className="text-2xl font-bold text-center">ChatComponent</h1>
          <p className="text-center text-gray-500 text-sm">
            WebSocket connected:{" "}
            {socket.current?.readyState === WebSocket.OPEN ? "✅" : "❌"}
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
              onClick={() =>
                handleSendInviteToRoomSchema(roomIdInput, userToAdd)
              }
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
          {/* join Room */}
          <div className="flex flex-col space-y-2">
            <input
              type="text"
              placeholder="Room ID to join"
              value={roomIdToJoin}
              onChange={(e) => setRoomIdToJoin(e.target.value)}
              className="border rounded px-2 py-1"
            />
            <button
              onClick={() => handleSendRequestJoinRoom(roomIdToJoin)}
              className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-purple-600"
            >
              Join Room
            </button>
          </div>
          {/* Request list of rooms */}
          <div className="flex flex-col space-y-2">
            <button
              onClick={() => handleSendRequestRoomList()}
              className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-purple-600"
            >
              Get list of rooms
            </button>
          </div>
        </div>
      </div>
      {/* Component ALA */}
      <ChatBox />
    </div>
  );
}
