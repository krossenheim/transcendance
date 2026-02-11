"use client"

import { ChatRoomUserAccessType } from "@app/shared/api/service/chat/db_models"
import { user_url } from "@app/shared/api/service/common/endpoints"
import { useLanguage } from "../../../i18n/LanguageContext"
import { useChatStore } from "../store/chatStore"
import { useWebSocket } from "../../../socketComponent"

import type React from "react"

export const ChatHeader: React.FC = () => {
  const { t } = useLanguage()

  const { sendMessage } = useWebSocket();

  const currentRoomId = useChatStore(state => state.rooms.data.currentRoomId);
  const userChatRooms = useChatStore(state => state.rooms.data.userChatRooms);

  const roomData = currentRoomId ? userChatRooms.get(currentRoomId) : undefined;

  return (
    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gradient-to-r from-blue-500/70 to-purple-500/70 flex-none">
      <h2 className="text-lg font-semibold text-white">
        {roomData ? `#${roomData.roomName}` : t('chat.selectRoom')}
      </h2>
      {roomData && (
        <button className="px-3 py-1 text-sm bg-pink-500 text-white hover:bg-pink-600 transition-all shadow-md rounded-md">
          🏓 {t('chat.inviteToPong')}
        </button>
      )}
    </div>
  )
}