"use client"

import { user_url } from "@app/shared/api/service/common/endpoints"
import React from "react"
import { useState, useCallback } from "react"
import { useLanguage } from "../../../i18n/LanguageContext"
import { useChatStore } from "../store/chatStore"
import { useWebSocket } from "../../../socketComponent"
import { useGlobalStore } from "../../global/store/globalStore"

enum formInputMode {
  NONE,
  CREATE_ROOM,
  CREATE_DM,
}

const RoomList: React.FC = () => {
  const { t } = useLanguage();
  const { sendMessage } = useWebSocket();
  const [inputValue, setInputValue] = useState("");
  const [inputFormState, setInputFormState] = useState(formInputMode.NONE);

  const currentRoomId = useChatStore(state => state.rooms.data.currentRoomId);
  const userChatRooms = useChatStore(state => state.rooms.data.userChatRooms);
  const userChatRoomsUIData = useChatStore(state => state.rooms.data.roomUIData);

  const handleCreateRoom = useCallback(() => {
    const roomName = inputValue.trim();
    if (!roomName) return ;

    sendMessage(user_url.ws.chat.addRoom, { roomName });
    setInputFormState(formInputMode.NONE);
    setInputValue("");

  }, [inputValue, sendMessage]);

  const handleCreateDM = useCallback(() => {
    const targetUsername = inputValue.trim();
    if (!targetUsername) return ;

    const userCache = useGlobalStore.getState().users.data.userCache;
    const userData = Array.from(userCache.values()).filter((user) => user.username === targetUsername);
    if (userData.length === 0) return ;

    sendMessage(user_url.ws.chat.sendDirectMessage, { targetUserId: userData[0]!.id, messageString: "👋 Hello!" });
  }, [inputValue, sendMessage]);

  const handleInputForm = useCallback(() => {
    if (inputFormState === formInputMode.CREATE_ROOM) {
      handleCreateRoom();
    } else if (inputFormState === formInputMode.CREATE_DM) {
      handleCreateDM();
    }
  }, [handleCreateRoom, handleCreateDM, inputFormState]);

  const handleSelectRoom = useCallback((roomId: number) => {
    const roomData = userChatRooms.get(roomId);
    if (roomData === undefined) return ;

    sendMessage(user_url.ws.chat.getRoomData, { roomId });
  }, [userChatRooms, sendMessage]);

  const handleRefreshRooms = useCallback(() => {
    sendMessage(user_url.ws.chat.listRooms, {});
  }, [sendMessage])

  const handleLeaveRoom = useCallback((roomId: number) => {
    sendMessage(user_url.ws.chat.leaveRoom, { roomId });
  }, [sendMessage]);

  return (
    <div className="glass-dark-sm glass-border h-[300px] md:h-[600px] flex flex-col overflow-hidden" role="navigation" aria-label="Chat rooms list">
      <div className="px-4 py-3 border-b border-gray-700 bg-gradient-to-r from-purple-500/70 to-pink-500/70">
        <h2 className="text-lg font-semibold text-white" id="room-list-title">{t('chat.rooms')}</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {userChatRooms.size > 0 ? (
          Array.from(userChatRooms.values()).map((room) => {
            const uiData = userChatRoomsUIData.get(room.roomId);
            const unreadCount = uiData?.unreadMessageCount || 0;
            const isCurrent = room.roomId === currentRoomId;

            return (
            <div
              key={room.roomId}
              className={`relative w-full text-left px-4 py-3 transition-all cursor-pointer ${
                isCurrent
                  ? "bg-blue-500 text-white shadow-md"
                  : "bg-gray-700/45 hover:bg-gray-600/45 text-gray-200"
              }`}
              onClick={() => handleSelectRoom(room.roomId)}
              role="button"
              aria-label={`Join room ${room.roomName}`}
              aria-current={isCurrent ? "true" : "false"}
            >
              <div className="flex items-center justify-between pr-6">
                <div className="overflow-hidden">
                  <div className="font-medium truncate">{room.roomName}</div>
                  <div className="text-xs opacity-75">ID: {room.roomId}</div>
                </div>

                {unreadCount > 0 && (
                  <div className={`
                    flex items-center justify-center
                    min-w-[20px] h-5 px-1.5 ml-2
                    text-[10px] font-bold rounded-full shadow-sm
                    ${isCurrent
                      ? "bg-white text-blue-600"
                      : "bg-red-500 text-white"
                    }
                  `}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </div>
                )}
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleLeaveRoom(room.roomId)
                }}
                className={`absolute top-2 right-2 w-6 h-6 flex items-center justify-center text-lg font-bold rounded hover:bg-red-500 hover:text-white transition-all ${
                  isCurrent ? "text-white/70 hover:text-white" : "text-gray-400 hover:text-white"
                }`}
                aria-label={`Leave room ${room.roomName}`}
              >
                ×
              </button>
            </div>
          )})
        ) : (
          <p className="text-gray-500 text-center text-sm italic py-8">{t('chat.noRooms')}</p>
        )}
      </div>

      <div className="p-3 border-t border-gray-700 space-y-2">
        {inputFormState !== formInputMode.NONE ? (
          <div className="space-y-2">
            <input
              type="text"
              placeholder={t('chat.roomNamePlaceholder')}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleInputForm()}
              className="w-full border border-gray-600 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-gray-700/70 text-gray-200"
              autoFocus
              aria-label="New room name"
            />
            <div className="flex space-x-2">
              <button
                onClick={handleInputForm}
                className="flex-1 bg-purple-500 text-white px-3 py-2 hover:bg-purple-600 text-sm"
                aria-label="Create new room"
              >
                {t('chat.create')}
              </button>
              <button
                onClick={() => {
                  setInputFormState(formInputMode.NONE)
                  setInputValue("")
                }}
                className="flex-1 bg-gray-700 text-gray-200 px-3 py-2 hover:bg-gray-600 text-sm"
                aria-label="Cancel room creation"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={() => setInputFormState(formInputMode.CREATE_ROOM)}
              className="w-full bg-purple-500 text-white px-4 py-2 hover:bg-purple-600 transition-all"
              aria-label="Show create room form"
            >
              {t('chat.createRoom')}
            </button>
            <button
              onClick={handleRefreshRooms}
              className="w-full bg-gray-700 text-gray-200 px-4 py-2 hover:bg-gray-600 transition-all"
              aria-label="Refresh rooms list"
            >
            🔄 {t('chat.refreshRooms')}
            </button>
            <button
              onClick={() => setInputFormState(formInputMode.CREATE_DM)}
              className="w-full bg-blue-500 text-white px-4 py-2 hover:bg-blue-600 transition-all"
              aria-label="Start direct message"
            >
              💬 {t('chat.directMessage')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default RoomList

