"use client"

import type React from "react"
import { useChatStore } from "../../stores/chatStore"
import { ChatHeader } from "./ChatHeader"
import { ChatUserSidebar } from "./ChatUserSidebar"
import { ChatMessageList } from "./ChatMessageList"
import { ChatInput } from "./ChatInput"
import type { RoomUser } from "./types"

interface ChatBoxProps {
  onInvitePong: (roomUsers: RoomUser[]) => void
  onBlockUser: (userId: number) => void
  blockedUserIds: number[]
  roomUsers: RoomUser[]
  selfUserId: number
}

const ChatBox: React.FC<ChatBoxProps> = ({
  isJoined = false,
  onJoinRoom,
  onInvitePong,
  onBlockUser,
  blockedUserIds,
  roomUsers,
  selfUserId,
}) => {
  const roomData = useChatStore(state => state.currentRoomId ? state.userChatRooms.get(state.currentRoomId) : undefined);

  return (
    <div className="glass-light-sm dark:glass-dark-sm glass-border h-full max-h-[600px] flex flex-col overflow-hidden relative">
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* 1. Header */}
      <ChatHeader />

      {/* 2. Main Content (Messages + Sidebar) */}
      <div className="flex-1 flex overflow-hidden">
        <ChatMessageList />
        <ChatUserSidebar />
      </div>

      {/* 3. Input */}
      <ChatInput 
        roomData={roomData}
        selfUserId={selfUserId}
      />
    </div>
  )
}

export default ChatBox