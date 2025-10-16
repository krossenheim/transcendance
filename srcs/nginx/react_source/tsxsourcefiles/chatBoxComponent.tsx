import React, { useImperativeHandle, useState, forwardRef } from "react";

// Example type — adjust to match your actual definition
export type TypeStoredMessageSchema = {
  user: string;
  content: string;
  timestamp?: string;
};

// Props (none needed here, but you could add socket, user info, etc.)
interface ChatBoxProps {}

// The exposed methods via ref
export interface ChatBoxHandle {
  addMessageToChatBox: (data: TypeStoredMessageSchema) => void;
}

export const ChatBox = forwardRef<ChatBoxHandle, ChatBoxProps>((_, ref) => {
  const [messages, setMessages] = useState<TypeStoredMessageSchema[]>([]);
  const [input, setInput] = useState("");

  // Expose the external method
  useImperativeHandle(ref, () => ({
    addMessageToChatBox(data: TypeStoredMessageSchema) {
      setMessages((prev) => [...prev, data]);
    },
  }));

  const handleSend = () => {
    if (!input.trim()) return;
    const newMessage: TypeStoredMessageSchema = {
      user: "You",
      content: input,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, newMessage]);
    setInput("");
  };

  return (
    <div className="w-full max-w-md flex flex-col bg-white shadow-lg rounded-2xl p-4 space-y-3 border border-gray-100">
      <h2 className="text-xl font-semibold text-center text-gray-800">
        ChatBox
      </h2>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-gray-50 rounded-xl p-3 space-y-2 border border-gray-200 min-h-[200px]">
        {messages.length > 0 ? (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`px-3 py-2 rounded-xl w-fit max-w-[80%] shadow-sm ${
                msg.user === "You"
                  ? "bg-blue-100 text-gray-800 ml-auto"
                  : "bg-gray-200 text-gray-800"
              }`}
            >
              <span className="block text-xs text-gray-500">{msg.user}</span>
              {msg.content}
            </div>
          ))
        ) : (
          <p className="text-gray-400 text-center text-sm italic">
            No messages yet
          </p>
        )}
      </div>

      {/* Input */}
      <div className="flex space-x-2">
        <input
          type="text"
          placeholder="Type a message..."
          className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={input}
          onChange={(e) => setInput(e.target.value)}
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
});
