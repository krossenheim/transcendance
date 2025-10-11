import React, { useEffect, useCallback } from "react";

export function ChatComponent({ webSocket }) {
  // --- Incoming message handlers ---
  const handleRoomListReceived = useCallback((data) => {
    console.log("User joined:", data);
  }, []);

  const handleRoomDetailsReceived = useCallback((data) => {
    console.log("User left:", data);
  }, []);

  const handleChatMessageReceived = useCallback((data) => {
    console.log("Chat message:", data);
  }, []);

  // --- Outgoing message handlers ---
  const handleSendChatMessage = useCallback(
    (message) => {
      if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(JSON.stringify({ type: "chat", message }));
      }
    },
    [webSocket]
  );

  const handleSendInviteToRoom = useCallback(
    (isTyping) => {
      if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(JSON.stringify({ type: "typing", isTyping }));
      }
    },
    [webSocket]
  );

  // --- WebSocket message routing ---
  useEffect(() => {
    if (!webSocket) return;

    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case "user_joined":
            handleUserJoined(data);
            break;
          case "user_left":
            handleUserLeft(data);
            break;
          case "chat_message":
            handleChatMessage(data);
            break;
          default:
            console.warn("Unknown message type:", data.type);
        }
      } catch (err) {
        console.error("Invalid message format:", err);
      }
    };

    webSocket.addEventListener("message", handleMessage);
    return () => webSocket.removeEventListener("message", handleMessage);
  }, [webSocket, handleUserJoined, handleUserLeft, handleChatMessage]);

  // --- Minimal UI ---
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4">
      <div className="w-full max-w-md shadow-lg p-6 rounded-2xl bg-white">
        <h1 className="text-2xl font-bold text-center">Chat</h1>
      </div>
    </div>
  );
}
