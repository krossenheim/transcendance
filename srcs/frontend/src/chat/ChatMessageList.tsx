"use client"

import { user_url } from "@app/shared/api/service/common/endpoints"
import { useProfileModalStore } from "../stores/uiStore"
import { useGlobalStore } from "../stores/globalStore"
import { getUserColorCSS } from "../userColorUtils"
import { useChatStore } from "../stores/chatStore"
import { useWebSocket } from "../socketComponent"
import { useRef, useEffect } from "react"

import type React from "react"

export const ChatMessageList: React.FC = () => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { openProfileModal } = useProfileModalStore.getState();

  const { currentUserId, publicUserDataCache } = useGlobalStore();
  const { currentRoomMessages } = useChatStore();
  const { sendMessage } = useWebSocket();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [currentRoomMessages])

  const requestUserData = (userId: number) => {
    sendMessage(user_url.ws.users.requestUserProfileData, userId);
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col">
      {currentRoomMessages.map((msg, i) => {
          const userColor = msg.userId !== undefined ? getUserColorCSS(msg.userId, true) : undefined
          const userData = publicUserDataCache.get(msg.userId)

          if (userData === undefined) {
            requestUserData(msg.userId);
          }

          const visibleUsername = userData ? userData.alias || userData.username : `Unknown user ${msg.userId}`
          const timestamp = new Date(msg.messageDate * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          
          const isSelf = msg.userId === currentUserId;

          return (
            <div key={i} className={`flex flex-col mb-3 ${isSelf ? 'items-end' : 'items-start'}`}>
                
                <div className={`flex items-baseline gap-2 mb-1 px-1 ${isSelf ? 'flex-row-reverse' : 'flex-row'}`}>
                  <span 
                    onClick={() => msg.userId && openProfileModal(msg.userId)} 
                    className="text-sm font-bold hover:underline cursor-pointer" 
                    style={{ color: userColor }}
                  >
                    {visibleUsername}
                  </span>
                  {timestamp && (
                    <span className="text-[10px] text-gray-400 select-none">
                      {timestamp}
                    </span>
                  )}
                </div>
                
                <div className={`px-4 py-2 max-w-[85%] shadow-sm text-sm break-words leading-relaxed
                    ${isSelf 
                       ? 'bg-blue-600 text-white rounded-2xl rounded-tr-none' 
                       : 'glass-light-xs dark:glass-dark-xs glass-border text-gray-900 dark:text-gray-100 rounded-2xl rounded-tl-none'
                    }
                `}> 
                  <p>{msg.messageString}</p>
                </div>
            </div>
          )
      })}
      <div ref={messagesEndRef} />
    </div>
  )
}