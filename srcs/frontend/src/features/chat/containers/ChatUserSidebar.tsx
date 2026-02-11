"use client"

import { ChatRoomUserAccessType } from "@app/shared/api/service/chat/db_models"
import { user_url } from "@app/shared/api/service/common/endpoints"
import { useProfileModalStore } from "../../../stores/uiStore"
import { useGlobalStore } from "../../global/store/globalStore"
import { useLanguage } from "../../../i18n/LanguageContext"
import { UserListItem } from "@features/chat/components/UserListItem"

import { useChatStore } from "@features/chat/store/chatStore"
import { useWebSocket } from "../../../socketComponent"

import type React from "react"

export const ChatUserSidebar: React.FC = () => {
  const { t } = useLanguage();
  const { openProfileModal } = useProfileModalStore.getState();

  const { sendMessage } = useWebSocket();
  const currentRoomUserConnections = useChatStore(state => state.rooms.data.currentRoomUserConnections);
  const onlineUsers = useGlobalStore(state => state.users.data.onlineUsers);
  const publicUserDataCache = useGlobalStore(state => state.users.data.userCache);

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
            
            return (
              <UserListItem
                userId={user.userId}
                username={visibleUsername}
                isOnline={isOnline}
                onClick={(userId) => openProfileModal(userId)}
              />
            )
          }
        )}
      </div>
    </div>
  )
}