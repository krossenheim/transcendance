"use client"

import type React from "react"
import { useChatStore } from "@src/features/chat/store/chatStore"
import { ChatHeader } from "./ChatHeader"
import { ChatUserSidebar } from "./ChatUserSidebar"
import { ChatMessageList } from "./ChatMessageList"
import { ChatInput } from "./ChatInput"

const ChatBox: React.FC = () => {
  const roomData = useChatStore(state => state.rooms.data.currentRoomId ? state.rooms.data.userChatRooms.get(state.rooms.data.currentRoomId) : undefined);

  return (
    <div className="glass-dark-sm glass-border h-full min-h-[350px] max-h-[400px] md:max-h-[600px] flex flex-col overflow-hidden relative">
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <ChatHeader />

      <div className="flex-1 flex overflow-hidden">
        <ChatMessageList />
        <ChatUserSidebar />
      </div>

      <ChatInput 
        roomData={roomData}
      />
    </div>
  )
}

export default ChatBox