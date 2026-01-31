"use client"

import { ChatRoomUserAccessType } from "@app/shared/api/service/chat/db_models"
import { user_url } from "@app/shared/api/service/common/endpoints"
import { useProfileModalStore } from "../../stores/uiStore"
import { useGlobalStore } from "../../stores/globalStore"
import { useLanguage } from "../../i18n/LanguageContext"
import { getUserColorCSS } from "../../hooks/userColorUtils"
import { useChatStore } from "../../stores/chatStore"
import { useWebSocket } from "../../app/providers/SocketProvider"

import type React from "react"

export const ChatUserSidebar: React.FC = () => {
  const { t } = useLanguage();
  const { openProfileModal } = useProfileModalStore.getState();

  const { sendMessage } = useWebSocket();
  const { currentRoomUserConnections } = useChatStore();
  const { onlineUsers, publicUserDataCache } = useGlobalStore();

  const requestUserData = (userId: number) => {
    sendMessage(user_url.ws.users.requestUserProfileData, userId);
  }

  const joinedUsers = currentRoomUserConnections.filter(user => user.userState === ChatRoomUserAccessType.JOINED);

  return (
    <div className="w-48 glass-light-xs dark:glass-dark-xs glass-border border-l border-gray-200 dark:border-gray-700 overflow-y-auto hidden md:block h-full">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 sticky top-0 backdrop-blur-sm z-10">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">{t('chat.users')} ({joinedUsers.length})</h3>
      </div>
      <div className="p-2 space-y-1">
        {[...joinedUsers]
          .sort((a, b) => {
            const statusA = onlineUsers.has(a.userId) ? 1 : 0
            const statusB = onlineUsers.has(b.userId) ? 1 : 0
            if (statusA !== statusB) return statusB - statusA
            const userA = publicUserDataCache.get(a.userId)?.username || ''
            const userB = publicUserDataCache.get(b.userId)?.username || ''
            return userA.localeCompare(userB)
          })
          .map((user) => {
            const userData = publicUserDataCache.get(user.userId)

            if (userData === undefined) {
              requestUserData(user.userId);
            }

            const visibleUsername = userData ? userData.alias || userData.username : `User ${user.userId}`
            const isOnline = onlineUsers.has(user.userId)
            const userColor = getUserColorCSS(user.userId, true)
            
            return (
              <div
                key={user.userId}
                onClick={() => openProfileModal(user.userId)}
                className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-200 dark:hover:bg-gray-700/60 cursor-pointer rounded-md transition-colors group"
              >
                <div className="relative">
                  <div className={`w-2.5 h-2.5 rounded-full ring-2 ring-offset-1 ring-offset-transparent transition-colors ${
                    isOnline ? 'bg-green-500 ring-green-500/20' : 'bg-gray-400 ring-gray-400/20'
                  }`} />
                </div>
                <span className="text-xs font-medium truncate group-hover:opacity-100 opacity-90 transition-opacity" style={{ color: userColor }}>
                  {visibleUsername}
                </span>
              </div>
            )
          }
        )}
      </div>
    </div>
  )
}