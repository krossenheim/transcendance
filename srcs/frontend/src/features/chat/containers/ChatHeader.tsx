"use client"

import { ChatRoomUserAccessType } from "@app/shared/api/service/chat/db_models"
import { user_url } from "@app/shared/api/service/common/endpoints"
import { useLanguage } from "../../../i18n/LanguageContext"
import { useChatStore } from "../store/chatStore"
import { useWebSocket } from "../../../socketComponent"
import { useGlobalStore } from "../../global/store/globalStore"
import { usePongStore } from "../../../stores/pongStore"
import { useNavigate } from "react-router-dom"

import type React from "react"

export const ChatHeader: React.FC = () => {
  const { t } = useLanguage()
  const navigate = useNavigate()

  const { sendMessage } = useWebSocket();

  const currentRoomId = useChatStore(state => state.rooms.data.currentRoomId);
  const userChatRooms = useChatStore(state => state.rooms.data.userChatRooms);
  const currentRoomUserConnections = useChatStore(state => state.rooms.data.currentRoomUserConnections);

  const userCache = useGlobalStore(state => state.users.data.userCache);
  const onlineUsers = useGlobalStore(state => state.users.data.onlineUsers);

  const setInviteRoomUsers = usePongStore(state => state.setInviteRoomUsers);
  const setShowInviteModalLocal = usePongStore(state => state.setShowInviteModalLocal);

  const roomData = currentRoomId ? userChatRooms.get(currentRoomId) : undefined;

  const handleInviteToPong = () => {
    // Build room users list from current room connections
    // userState can be numeric (0/1), string ("INVITED"/"JOINED"), or enum value
    // JOINED = 1, INVITED = 0 - so we filter for "not invited"
    const roomUsers = currentRoomUserConnections
      .filter(conn => {
        const state = conn.userState;
        // Accept JOINED in any of its possible representations
        return state === 1 || state === "JOINED" || state === ChatRoomUserAccessType.JOINED ||
               (state !== 0 && state !== "INVITED" && state !== ChatRoomUserAccessType.INVITED);
      })
      .map(conn => {
        const cached = userCache.get(conn.userId);
        return {
          id: conn.userId,
          username: cached?.username || `User ${conn.userId}`,
          onlineStatus: onlineUsers.has(conn.userId) ? 1 : 0,
        };
      });

    setInviteRoomUsers(roomUsers);
    setShowInviteModalLocal(true);
    navigate('/pong');
  };

  return (
    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gradient-to-r from-blue-500/70 to-purple-500/70 flex-none">
      <h2 className="text-lg font-semibold text-white">
        {roomData ? `#${roomData.roomName}` : t('chat.selectRoom')}
      </h2>
      {roomData && (
        <button 
          onClick={handleInviteToPong}
          className="px-3 py-1 text-sm bg-pink-500 text-white hover:bg-pink-600 transition-all shadow-md rounded-md"
        >
          🏓 {t('chat.inviteToPong')}
        </button>
      )}
    </div>
  )
}