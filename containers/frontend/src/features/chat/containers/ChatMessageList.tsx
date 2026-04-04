"use client"

import type { TypeStoredMessageSchema } from "@app/shared/api/service/chat/db_models"
import { ChatMessage } from "../components/ChatMessage"

import { useProfileModalStore } from "@src/features/global/modals/profile/profileModalStore"
import { useGlobalStore } from "@src/features/global/store/globalStore"
import { useChatStore } from "@src/features/chat/store/chatStore"

import { useRef, useEffect } from "react"
import type React from "react"

const NO_MESSAGES: TypeStoredMessageSchema[] = [];

export const ChatMessageList: React.FC = () => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { openProfileModal } = useProfileModalStore.getState();
  console.log("Rendering ChatMessageList component");

  const currentUserId = useGlobalStore(state => state.me.data.currentUserId);
  const publicUserDataCache = useGlobalStore(state => state.users.data.userCache);
  const userBlockedIds = useGlobalStore(state => state.users.data.blockedUsers);
  const currentRoomMessages = useChatStore(state => {
    const currentId = state.rooms.data.currentRoomId;
    const map = state.messages.data.messagesPerRoom;
    if (currentId === null) return NO_MESSAGES;
    const messages = map.get(currentId);
    return messages ?? NO_MESSAGES;
});

console.log("Blocked user IDs:", Array.from(userBlockedIds));

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [currentRoomMessages])

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col">
      {currentRoomMessages
        .filter((msg) => !userBlockedIds.has(msg.userId))
        .map((msg, i) => {
          const userData = publicUserDataCache.get(msg.userId)
          if (userData === undefined)
            useGlobalStore.getState().users.actions.fetchPublicUserData(msg.userId);

          return (
            <ChatMessage
              user={userData}
              message={msg}
              isSelf={msg.userId === currentUserId}
              onProfileClick={(userId) => {
                openProfileModal(userId);
              }}
            />
          )
      })}
      <div ref={messagesEndRef} />
    </div>
  )
}