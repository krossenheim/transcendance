import type {
  TypeStoredMessageSchema,
  TypeListRoomsSchema,
  TypeRoomMessagesSchema,
  TypeRoomSchema,
} from "../../../nodejs_base_image/utils/api/service/chat/db_models";
import React, { useCallback, useEffect, useState, useRef } from "react";
import { user_url } from "../../../nodejs_base_image/utils/api/service/common/endpoints";
import { useWebSocket } from "./socketComponent";

/* -------------------- ChatBox Component -------------------- */
interface ChatBoxProps {
  messages: Array<{
    user: string;
    content: string;
    timestamp?: string;
  }>;
  onSendMessage: (content: string) => void;
  currentRoom: string | null;
  currentRoomName: string | null;
  onInvitePong: () => void;
  onBlockUser: (username: string) => void;
  blockedUsers: string[];
  onOpenProfile: (username: string) => void;
}

const ChatBox: React.FC<ChatBoxProps> = ({
  messages,
  onSendMessage,
  currentRoom,
  currentRoomName,
  onInvitePong,
  onBlockUser,
  blockedUsers,
  onOpenProfile,
}) => {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || !currentRoom) return;
    onSendMessage(input);
    setInput("");
  };

  return (
    <div className="flex flex-col bg-white shadow-lg rounded-2xl border border-gray-200 h-[600px]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-blue-500 to-purple-500 rounded-t-2xl">
        <div>
          <h2 className="text-lg font-semibold text-white">
            {currentRoom ? `${currentRoomName || "Room"}` : "Select a room"}
          </h2>
          {currentRoom && (
            <p className="text-xs text-white opacity-75">ID: {currentRoom}</p>
          )}
        </div>
        {currentRoom && (
          <button
            onClick={onInvitePong}
            className="bg-green-500 text-white text-sm px-3 py-1 rounded-md hover:bg-green-600 transition-all"
          >
            🏓 Invite to Pong
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-4 space-y-3">
        {messages.length > 0 ? (
          messages
            .filter((msg) => !blockedUsers.includes(msg.user))
            .map((msg, i) => (
              <div key={i} className="flex justify-start">
                <div className="px-4 py-2 rounded-2xl max-w-[70%] shadow-sm bg-white text-gray-800 border border-gray-200">
                  <div className="flex justify-between items-center">
                    <span
                      onClick={() => onOpenProfile(msg.user)}
                      className="block text-xs font-semibold text-blue-600 mb-1 hover:underline cursor-pointer"
                    >
                      {msg.user}
                    </span>
                    <button
                      onClick={() => onBlockUser(msg.user)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      {blockedUsers.includes(msg.user) ? "Unblock" : "Block"}
                    </button>
                  </div>
                  <p className="text-sm">{msg.content}</p>
                  {msg.timestamp && (
                    <span className="block text-xs text-gray-400 mt-1">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>
            ))
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400 text-center text-sm italic">
              {currentRoom
                ? "No messages yet. Start the conversation!"
                : "Join a room to start chatting"}
            </p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200 bg-white rounded-b-2xl">
        <div className="flex space-x-2">
          <input
            type="text"
            placeholder={
              currentRoom ? "Type a message..." : "Select a room first..."
            }
            className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            disabled={!currentRoom}
          />
          <button
            onClick={handleSend}
            disabled={!currentRoom}
            className="bg-blue-500 text-white px-6 py-2 rounded-full hover:bg-blue-600 active:scale-95 transition-all disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

/* -------------------- Room List Component -------------------- */
interface RoomListProps {
  rooms: TypeRoomSchema[];
  currentRoom: string | null;
  onSelectRoom: (roomId: string) => void;
  onCreateRoom: (roomName: string) => void;
  onRefreshRooms: () => void;
  onStartDM: (username: string) => void;
}

const RoomList: React.FC<RoomListProps> = ({
  rooms,
  currentRoom,
  onSelectRoom,
  onCreateRoom,
  onRefreshRooms,
  onStartDM,
}) => {
  const [newRoomName, setNewRoomName] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const handleCreate = () => {
    if (!newRoomName.trim()) return;
    onCreateRoom(newRoomName);
    setNewRoomName("");
    setShowCreateForm(false);
  };

  return (
    <div className="bg-white shadow-lg rounded-2xl border border-gray-200 h-[600px] flex flex-col">
      <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-purple-500 to-pink-500 rounded-t-2xl">
        <h2 className="text-lg font-semibold text-white">Chat Rooms</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {rooms.length > 0 ? (
          rooms.map((room) => (
            <button
              key={room.roomId}
              onClick={() => onSelectRoom(room.roomId)}
              className={`w-full text-left px-4 py-3 rounded-xl transition-all ${
                currentRoom === room.roomId
                  ? "bg-blue-500 text-white shadow-md"
                  : "bg-gray-50 hover:bg-gray-100 text-gray-800"
              }`}
            >
              <div className="font-medium">{room.roomName}</div>
              <div className="text-xs opacity-75">ID: {room.roomId}</div>
            </button>
          ))
        ) : (
          <p className="text-gray-400 text-center text-sm italic py-8">
            No rooms available. Create one!
          </p>
        )}
      </div>

      <div className="p-3 border-t border-gray-200 space-y-2">
        {showCreateForm ? (
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Room name..."
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
              autoFocus
            />
            <div className="flex space-x-2">
              <button
                onClick={handleCreate}
                className="flex-1 bg-purple-500 text-white px-3 py-2 rounded-lg hover:bg-purple-600 text-sm"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setNewRoomName("");
                }}
                className="flex-1 bg-gray-200 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-300 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={() => setShowCreateForm(true)}
              className="w-full bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition-all"
            >
              + Create Room
            </button>
            <button
              onClick={onRefreshRooms}
              className="w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-all"
            >
              🔄 Refresh Rooms
            </button>
            <button
              onClick={() => {
                const username = prompt("Enter username to start DM:");
                if (username) onStartDM(username);
              }}
              className="w-full bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-all"
            >
              💬 Direct Message
            </button>
          </>
        )}
      </div>
    </div>
  );
};

/* -------------------- Main Chat Component -------------------- */
export default function ChatInputComponent() {
  const { socket, payloadReceived } = useWebSocket();
  const [rooms, setRooms] = useState<TypeRoomSchema[]>([]);
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [currentRoomName, setCurrentRoomName] = useState<string | null>(null);
  // Store messages per room to prevent losing them when switching
  const [messagesByRoom, setMessagesByRoom] = useState<Record<string, Array<{
    user: string;
    content: string;
    timestamp?: string;
  }>>>({});
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);

  // Get messages for current room
  const messages = currentRoomId ? (messagesByRoom[currentRoomId] || []) : [];

  const sendToSocket = useCallback(
    (funcId: string, payload: any) => {
      if (socket.current && socket.current.readyState === WebSocket.OPEN) {
        const toSend = {
          funcId,
          payload,
          target_container: "chat",
        };
        console.log("Sending to socket:", toSend);
        socket.current.send(JSON.stringify(toSend));
      } else {
        console.warn("Socket not open, cannot send:", funcId);
      }
    },
    [socket]
  );

  /* -------------------- Handle Incoming Messages -------------------- */
  useEffect(() => {
    if (!payloadReceived) return;
    
    console.log("Received payload:", payloadReceived);

    switch (payloadReceived.funcId) {
      case user_url.ws.chat.sendMessage.funcId:
        try {
          // Transform the StoredMessageSchema to our local message format
          const messagePayload = payloadReceived.payload as TypeStoredMessageSchema;
          
          if (!messagePayload || !messagePayload.roomId) {
            console.error("Invalid message payload:", messagePayload);
            break;
          }
          
          // Check if messageDate is in seconds or milliseconds
          // If it's less than year 3000 timestamp in seconds, it's likely in seconds
          const timestamp = messagePayload.messageDate < 32503680000 
            ? new Date(messagePayload.messageDate * 1000).toISOString()
            : new Date(messagePayload.messageDate).toISOString();
            
          const transformedMessage = {
            user: `User ${messagePayload.userId}`,
            content: messagePayload.messageString,
            timestamp: timestamp,
          };
          console.log("Adding message:", transformedMessage, "messageDate:", messagePayload.messageDate);
          
          // Add message to the specific room
          const roomIdStr = String(messagePayload.roomId);
          setMessagesByRoom((prev) => ({
            ...prev,
            [roomIdStr]: [...(prev[roomIdStr] || []), transformedMessage],
          }));
        } catch (error) {
          console.error("Error processing message:", error);
        }
        break;

      case user_url.ws.chat.listRooms.funcId:
        console.log("Setting rooms:", payloadReceived.payload);
        setRooms(payloadReceived.payload);
        break;

      case user_url.ws.chat.joinRoom.funcId:
        try {
          console.log("Joined room:", payloadReceived.payload);
          // When joining a room, we might receive initial messages
          // Check if the payload has a messages array
          if (payloadReceived.payload.messages && payloadReceived.payload.roomId) {
            const roomIdStr = String(payloadReceived.payload.roomId);
            const roomMessages = payloadReceived.payload.messages.map((msg: TypeStoredMessageSchema) => {
              const timestamp = msg.messageDate < 32503680000 
                ? new Date(msg.messageDate * 1000).toISOString()
                : new Date(msg.messageDate).toISOString();
              return {
                user: `User ${msg.userId}`,
                content: msg.messageString,
                timestamp: timestamp,
              };
            });
            setMessagesByRoom((prev) => ({
              ...prev,
              [roomIdStr]: roomMessages,
            }));
          } else {
            console.log("No messages received from server");
          }
        } catch (error) {
          console.error("Error processing join room:", error);
        }
        break;

      case user_url.ws.chat.addRoom.funcId:
        console.log("Room added, refreshing list");
        sendToSocket(user_url.ws.chat.listRooms.funcId, {});
        break;

      case user_url.ws.chat.addUserToRoom.funcId:
        console.log("User added to room:", payloadReceived.payload);
        const roomData = payloadReceived.payload as TypeRoomMessagesSchema;
        if (roomData.messages && roomData.roomId) {
          const roomIdStr = String(roomData.roomId);
          const roomMessages = roomData.messages.map((msg: TypeStoredMessageSchema) => ({
            user: `User ${msg.userId}`,
            content: msg.messageString,
            timestamp: new Date(msg.messageDate * 1000).toISOString(),
          }));
          setMessagesByRoom((prev) => ({
            ...prev,
            [roomIdStr]: roomMessages,
          }));
        }
        break;

      default:
        console.log("Unhandled funcId:", payloadReceived.funcId);
    }
  }, [payloadReceived, sendToSocket]);

  useEffect(() => {
    console.log("Requesting room list on mount");
    sendToSocket(user_url.ws.chat.listRooms.funcId, {});
  }, [sendToSocket]);

  /* -------------------- Handlers -------------------- */
  const handleSendMessage = useCallback(
    (content: string) => {
      if (!currentRoomId) return;
      console.log("Sending message to room:", currentRoomId, content);
      sendToSocket(user_url.ws.chat.sendMessage.funcId, {
        roomId: currentRoomId,
        messageString: content,
      });
    },
    [currentRoomId, sendToSocket]
  );

  const handleSelectRoom = useCallback(
    (roomId: string) => {
      const room = rooms.find((r) => r.roomId === roomId);
      console.log("Selecting room:", roomId, room);
      setCurrentRoomId(roomId);
      setCurrentRoomName(room?.roomName || null);
      sendToSocket(user_url.ws.chat.joinRoom.funcId, { roomId });
    },
    [rooms, sendToSocket]
  );

  const handleCreateRoom = useCallback(
    (roomName: string) => {
      console.log("Creating room:", roomName);
      sendToSocket(user_url.ws.chat.addRoom.funcId, { roomName });
    },
    [sendToSocket]
  );

  const handleRefreshRooms = useCallback(() => {
    console.log("Refreshing rooms");
    sendToSocket(user_url.ws.chat.listRooms.funcId, {});
  }, [sendToSocket]);

  const handleInvitePong = useCallback(() => {
    if (!currentRoomId) return;
    console.log("Inviting to pong in room:", currentRoomId);
    // This funcId might not exist yet - adjust based on your endpoints
    alert("Pong invitation feature not yet implemented");
  }, [currentRoomId]);

  const handleBlockUser = useCallback((username: string) => {
    setBlockedUsers((prev) =>
      prev.includes(username) ? prev.filter((u) => u !== username) : [...prev, username]
    );
  }, []);

  const handleOpenProfile = useCallback((username: string) => {
    console.log("Opening profile for:", username);
    // Implement profile view
    alert(`Profile view for ${username} - not yet implemented`);
  }, []);

  const handleStartDM = useCallback(
    (username: string) => {
      console.log("Starting DM with:", username);
      // This funcId might not exist yet - adjust based on your endpoints
      alert("DM feature not yet implemented");
    },
    [sendToSocket]
  );

  /* -------------------- Render -------------------- */
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <div className="w-full max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <RoomList
              rooms={rooms}
              currentRoom={currentRoomId}
              onSelectRoom={handleSelectRoom}
              onCreateRoom={handleCreateRoom}
              onRefreshRooms={handleRefreshRooms}
              onStartDM={handleStartDM}
            />
          </div>

          <div className="md:col-span-2">
            <ChatBox
              messages={messages}
              onSendMessage={handleSendMessage}
              currentRoom={currentRoomId}
              currentRoomName={currentRoomName}
              onInvitePong={handleInvitePong}
              onBlockUser={handleBlockUser}
              blockedUsers={blockedUsers}
              onOpenProfile={handleOpenProfile}
            />
          </div>
        </div>
      </div>
    </div>
  );
}