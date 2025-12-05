"use client"

import type { TypeRoomSchema } from "@/types/chat-models"
import type React from "react"
import { useState, useCallback } from "react"

interface RoomListProps {
  rooms: TypeRoomSchema[]
  currentRoom: number | null
  onSelectRoom: (roomId: number) => void
  onCreateRoom: (roomName: string) => void
  onRefreshRooms: () => void
  onLeaveRoom: (roomId: number) => void
  onStartDM: (username: string | number) => void
  selfUserId: number
  userMap: Record<number, string>
}

const RoomList: React.FC<RoomListProps> = ({
  rooms,
  currentRoom,
  onSelectRoom,
  onCreateRoom,
  onRefreshRooms,
  onLeaveRoom,
  onStartDM,
  selfUserId,
  userMap,
}) => {
  const [newRoomName, setNewRoomName] = useState("")
  const [showCreateForm, setShowCreateForm] = useState(false)
  
  const getDisplayName = useCallback((room: TypeRoomSchema) => {
    try {
      if (room?.roomType === 2 && typeof room.roomName === 'string' && room.roomName.startsWith('DM ')) {
        const parts = room.roomName.split(' ')
        if (parts.length === 3) {
          const a = Number(parts[1])
          const b = Number(parts[2])
          if (!Number.isNaN(a) && !Number.isNaN(b)) {
            const otherId = a === selfUserId ? b : (b === selfUserId ? a : null)
            if (otherId != null) {
              return userMap[otherId] || `DM with User ${otherId}`
            }
          }
        }
      }
    } catch {
      // Ignore parsing errors
    }
    return room.roomName
  }, [selfUserId, userMap])

  const handleCreate = () => {
    if (!newRoomName.trim()) return
    onCreateRoom(newRoomName)
    setNewRoomName("")
    setShowCreateForm(false)
  }

  return (
    <div className="glass-light-sm dark:glass-dark-sm glass-border h-[600px] flex flex-col overflow-hidden" role="navigation" aria-label="Chat rooms list">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-purple-500/70 to-pink-500/70">
        <h2 className="text-lg font-semibold text-white" id="room-list-title">Chat Rooms</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {rooms.length > 0 ? (
          rooms.map((room) => (
            <div
              key={room.roomId}
              className={`relative w-full text-left px-4 py-3 transition-all cursor-pointer ${
                currentRoom === room.roomId
                  ? "bg-blue-500 text-white shadow-md"
                  : "bg-gray-50 dark:bg-gray-700/45 hover:bg-gray-100 dark:hover:bg-gray-600/45 text-gray-800 dark:text-gray-200"
              }`}
              onClick={() => onSelectRoom(room.roomId)}
              role="button"
              aria-label={`Join room ${getDisplayName(room)}`}
              aria-current={currentRoom === room.roomId ? "true" : "false"}
            >
              <div className="font-medium pr-6">{getDisplayName(room)}</div>
              <div className="text-xs opacity-75">ID: {room.roomId}</div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onLeaveRoom(room.roomId)
                }}
                className={`absolute top-2 right-2 w-6 h-6 flex items-center justify-center text-lg font-bold rounded hover:bg-red-500 hover:text-white transition-all ${
                  currentRoom === room.roomId ? "text-white/70 hover:text-white" : "text-gray-400 hover:text-white"
                }`}
                aria-label={`Leave room ${getDisplayName(room)}`}
              >
                ×
              </button>
            </div>
          ))
        ) : (
          <p className="text-gray-400 dark:text-gray-500 text-center text-sm italic py-8">No rooms available. Create one!</p>
        )}
      </div>

      <div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
        {showCreateForm ? (
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Room name..."
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="w-full border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 dark:bg-gray-700/70 dark:text-gray-200"
              autoFocus
              aria-label="New room name"
            />
            <div className="flex space-x-2">
              <button
                onClick={handleCreate}
                className="flex-1 bg-purple-500 text-white px-3 py-2 hover:bg-purple-600 text-sm"
                aria-label="Create new room"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowCreateForm(false)
                  setNewRoomName("")
                }}
                className="flex-1 bg-gray-200 text-gray-700 px-3 py-2 hover:bg-gray-300 text-sm"
                aria-label="Cancel room creation"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={() => setShowCreateForm(true)}
              className="w-full bg-purple-500 text-white px-4 py-2 hover:bg-purple-600 transition-all"
              aria-label="Show create room form"
            >
              + Create Room
            </button>
            <button
              onClick={onRefreshRooms}
              className="w-full bg-gray-100 text-gray-700 px-4 py-2 hover:bg-gray-200 transition-all"
              aria-label="Refresh rooms list"
            >
              🔄 Refresh Rooms
            </button>
            <button
              onClick={() => {
                const usernameOrId = prompt("Enter username or user ID to start DM:")
                if (usernameOrId) onStartDM(usernameOrId)
              }}
              className="w-full bg-blue-500 text-white px-4 py-2 hover:bg-blue-600 transition-all"
              aria-label="Start direct message"
            >
              💬 Direct Message
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default RoomList
