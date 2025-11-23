"use client"

import type { TypeStoredMessageSchema, TypeRoomMessagesSchema, TypeRoomSchema } from "@/types/chat-models"
import type React from "react"
import { useCallback, useEffect, useState, useRef } from "react"
import { user_url } from "../../../nodejs_base_image/utils/api/service/common/endpoints"
import { ChatRoomUserAccessType } from "../../../nodejs_base_image/utils/api/service/chat/db_models"
import { useWebSocket } from "./socketComponent"
import ProfileComponent from "./profileComponent"
import FriendshipNotifications from "./friendshipNotifications"
import { useFriendshipContext } from "./friendshipContext"

/* -------------------- ChatBox Component -------------------- */
interface ChatBoxProps {
  messages: Array<{
    user: string
    content: string
    timestamp?: string
  }>
  onSendMessage: (content: string) => void
  currentRoom: number | null
  currentRoomName: string | null
  onInvitePong: () => void
  onBlockUser: (username: string) => void
  blockedUsers: string[]
  onOpenProfile: (username: string) => void
  roomUsers: Array<{ id: number; username: string; onlineStatus?: number }>
}

const ChatBox: React.FC<ChatBoxProps> = ({
  messages,
  onSendMessage,
  currentRoom,
  currentRoomName,
  onInvitePong,
  onBlockUser,
  blockedUsers,
  onOpenProfile,
  roomUsers,
}) => {
  const [input, setInput] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSend = () => {
    if (!input.trim() || !currentRoom) return
    onSendMessage(input)
    setInput("")
  }

  const isCommand = input.startsWith("/")

  return (
    <div className="flex flex-col bg-white dark:bg-gray-800 shadow-lg rounded-2xl border-2 border-gray-200 dark:border-gray-700 h-[600px] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-500 to-purple-500">
        <div>
          <h2 className="text-lg font-semibold text-white">
            {currentRoom ? `${currentRoomName || "Room"}` : "Select a room"}
          </h2>
          {currentRoom && <p className="text-xs text-white opacity-75">ID: {currentRoom}</p>}
        </div>
        {currentRoom && (
          <button
            onClick={onInvitePong}
            className="bg-green-500 text-white text-sm px-3 py-1 rounded-md hover:bg-green-600 transition-all"
          >
            🏓 Invite to Pong
          </button>
        )}
      </div>

      {/* Main content area with messages and users list */}
      <div className="flex flex-1 overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-4 space-y-3">
        {messages.length > 0 ? (
          messages
            .filter((msg) => !blockedUsers.includes(msg.user))
            .map((msg, i) => (
              <div key={i} className="flex justify-start">
                <div className="px-4 py-2 rounded-2xl max-w-[70%] shadow-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700">
                  <div className="flex justify-between items-center">
                    <span
                      onClick={() => onOpenProfile(msg.user)}
                      className="block text-xs font-semibold text-blue-600 mb-1 hover:underline cursor-pointer"
                    >
                      {msg.user}
                    </span>
                    <button
                      onClick={() => onBlockUser(msg.user)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      {blockedUsers.includes(msg.user) ? "Unblock" : "Block"}
                    </button>
                  </div>
                  <p className="text-sm">{msg.content}</p>
                  {msg.timestamp && (
                    <span className="block text-xs text-gray-400 mt-1">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>
            ))
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400 text-center text-sm italic">
              {currentRoom ? "No messages yet. Start the conversation!" : "Join a room to start chatting"}
            </p>
          </div>
        )}
          <div ref={messagesEndRef} />
        </div>

        {/* Users List Sidebar */}
        {currentRoom && (
          <div className="w-48 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-y-auto">
            <div className="p-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Users ({roomUsers.length})</h3>
            </div>
            <div className="p-2 space-y-1">
              {roomUsers.map((user) => (
                <div
                  key={user.id}
                  onClick={() => onOpenProfile(user.username)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                >
                  <div className={`w-2 h-2 rounded-full ${
                    user.onlineStatus === 1 ? 'bg-green-500' : 'bg-gray-400'
                  }`} />
                  <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                    {user.username}
                  </span>
                </div>
              ))}
              {roomUsers.length === 0 && (
                <div className="text-xs text-gray-400 text-center py-4">No users</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-b-2xl">
        <div className="flex space-x-2">
          <input
            type="text"
            placeholder={currentRoom ? "Type a message..." : "Select a room first..."}
            className={`flex-1 border rounded-full px-4 py-2 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 ${
              isCommand
                ? "border-purple-500 text-purple-600 dark:text-purple-400 focus:ring-purple-400"
                : "border-gray-300 dark:border-gray-600 focus:ring-blue-400"
            } disabled:bg-gray-100 dark:disabled:bg-gray-900 dark:bg-gray-700`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            disabled={!currentRoom}
          />
          <button
            onClick={handleSend}
            disabled={!currentRoom}
            className={`px-6 py-2 rounded-full active:scale-95 transition-all ${
              currentRoom
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-700 cursor-not-allowed'
            }`}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}

/* -------------------- Room List Component -------------------- */
interface RoomListProps {
  rooms: TypeRoomSchema[]
  currentRoom: number | null
  onSelectRoom: (roomId: number) => void
  onCreateRoom: (roomName: string) => void
  onRefreshRooms: () => void
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
    } catch {}
    return room.roomName
  }, [selfUserId, userMap])

  const handleCreate = () => {
    if (!newRoomName.trim()) return
    onCreateRoom(newRoomName)
    setNewRoomName("")
    setShowCreateForm(false)
  }

  return (
    <div className="bg-white dark:bg-gray-800 shadow-lg rounded-2xl border-2 border-gray-200 dark:border-gray-700 h-[600px] flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-purple-500 to-pink-500">
        <h2 className="text-lg font-semibold text-white">Chat Rooms</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {rooms.length > 0 ? (
          rooms.map((room) => (
            <button
              key={room.roomId}
              onClick={() => onSelectRoom(room.roomId)}
              className={`w-full text-left px-4 py-3 rounded-xl transition-all ${
                currentRoom === room.roomId
                  ? "bg-blue-500 text-white shadow-md"
                  : "bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200"
              }`}
            >
              <div className="font-medium">{getDisplayName(room)}</div>
              <div className="text-xs opacity-75">ID: {room.roomId}</div>
            </button>
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
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 dark:bg-gray-700 dark:text-gray-200"
              autoFocus
            />
            <div className="flex space-x-2">
              <button
                onClick={handleCreate}
                className="flex-1 bg-purple-500 text-white px-3 py-2 rounded-lg hover:bg-purple-600 text-sm"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowCreateForm(false)
                  setNewRoomName("")
                }}
                className="flex-1 bg-gray-200 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-300 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              onClick={() => setShowCreateForm(true)}
              className="w-full bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition-all"
            >
              + Create Room
            </button>
            <button
              onClick={onRefreshRooms}
              className="w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-all"
            >
              🔄 Refresh Rooms
            </button>
            <button
              onClick={() => {
                const usernameOrId = prompt("Enter username or user ID to start DM:")
                if (usernameOrId) onStartDM(usernameOrId)
              }}
              className="w-full bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-all"
            >
              💬 Direct Message
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/* -------------------- Main Chat Component -------------------- */
export default function ChatInputComponent({ 
  selfUserId,
  showToast 
}: { 
  selfUserId: number
  showToast?: (message: string, type: 'success' | 'error') => void
}) {
  const { socket, payloadReceived, isConnected } = useWebSocket()
  const { setPendingRequests, setAcceptHandler, setDenyHandler } = useFriendshipContext()
  const [rooms, setRooms] = useState<TypeRoomSchema[]>([])
  const [currentRoomId, setCurrentRoomId] = useState<number | null>(null)
  const [currentRoomName, setCurrentRoomName] = useState<string | null>(null)
  const [currentRoomType, setCurrentRoomType] = useState<number | null>(null)
  // Store messages per room to prevent losing them when switching
  const [messagesByRoom, setMessagesByRoom] = useState<
    Record<
      string,
      Array<{
        user: string
        content: string
        timestamp?: string
      }>
    >
  >({})
  const [blockedUsers, setBlockedUsers] = useState<string[]>([])
  const [profileUserId, setProfileUserId] = useState<number | null>(null)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [userMap, setUserMap] = useState<Record<number, string>>({}) // userId -> username map
  const [pendingFriendshipRequests, setPendingFriendshipRequests] = useState<Array<{ userId: number; username: string; alias?: string | null }>>([])
  const [pendingDMTargetId, setPendingDMTargetId] = useState<number | null>(null)
  const [currentRoomUsers, setCurrentRoomUsers] = useState<Array<{ id: number; username: string; onlineStatus?: number }>>([])

  // Get messages for current room
  const messages = currentRoomId != null ? messagesByRoom[String(currentRoomId)] || [] : []

  const computeRoomDisplayName = useCallback((room: TypeRoomSchema | undefined | null) => {
    if (!room) return null
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
    } catch {}
    return room?.roomName || null
  }, [selfUserId, userMap])

  const sendToSocket = useCallback(
    (funcId: string, payload: any, targetContainer?: string) => {
      if (socket.current && isConnected) {
        // Determine target container based on funcId if not explicitly provided
        let container = targetContainer
        if (!container) {
          if (funcId.includes('friendship') || funcId.includes('user_connections') || funcId.includes('confirm_') || funcId.includes('deny_') || funcId.includes('request_') || funcId === 'user_profile') {
            container = "users"
          } else {
            container = "chat"
          }
        }
        
        const toSend = {
          funcId,
          payload,
          target_container: container,
        }
        console.log("[v0] Sending to socket:", toSend)
        socket.current.send(JSON.stringify(toSend))
      } else {
        console.warn("[v0] Socket not connected, cannot send:", funcId)
        console.warn("[v0] isConnected:", isConnected)
        console.warn("[v0] Socket state:", socket.current?.readyState)
      }
    },
    [socket, isConnected],
  )

  /* -------------------- Handle Incoming Messages -------------------- */
  useEffect(() => {
    if (!payloadReceived) return

    console.log("[Chat] Received payload:", payloadReceived)
    console.log("[Chat] FuncId:", payloadReceived.funcId, "Type:", typeof payloadReceived.funcId)

    switch (payloadReceived.funcId) {
            case user_url.ws.users.fetchUserConnections.funcId:
        console.log("Setting user connections:", payloadReceived.payload)
        // Filter for pending friendship requests where someone requested friendship with us
        const connections = payloadReceived.payload || []
        
        // Add all connections to userMap (friends, pending, etc.)
        const connectionUserMap: Record<number, string> = {}
        connections.forEach((conn: any) => {
          if (conn && typeof conn.id === 'number' && typeof conn.username === 'string') {
            connectionUserMap[conn.id] = conn.username
          }
        })
        setUserMap((prev) => ({ ...prev, ...connectionUserMap }))
        console.log("Updated userMap with", Object.keys(connectionUserMap).length, "users from connections")
        
        const pending = connections
          .filter((conn: any) => conn.status === 1) // 1 = Pending in UserFriendshipStatusEnum
          .map((conn: any) => ({
            userId: conn.id,
            username: conn.username,
            alias: conn.alias,
          }))
        setPendingFriendshipRequests(pending)
        console.log("Pending friendship requests:", pending)
        break

      case user_url.ws.chat.sendMessage.funcId:
        try {
          // Transform the StoredMessageSchema to our local message format
          const messagePayload = payloadReceived.payload as TypeStoredMessageSchema

          console.log("=== Incoming message ===")
          console.log("Full payload:", JSON.stringify(messagePayload, null, 2))
          console.log("userId:", messagePayload.userId)
          console.log("userId type:", typeof messagePayload.userId)

          if (!messagePayload || !messagePayload.roomId) {
            console.error("Invalid message payload:", messagePayload)
            break
          }

          // Validate userId before using it
          if (!messagePayload.userId || typeof messagePayload.userId !== 'number') {
            console.error("❌ Invalid userId in message:", messagePayload.userId, "Full payload:", messagePayload)
            console.error("Message will be skipped because userId is missing or invalid")
            break
          }

          // Check if messageDate is in seconds or milliseconds
          // If it's less than year 3000 timestamp in seconds, it's likely in seconds
          const timestamp =
            messagePayload.messageDate < 32503680000
              ? new Date(messagePayload.messageDate * 1000).toISOString()
              : new Date(messagePayload.messageDate).toISOString()

          // Resolve username from userMap if available, otherwise fetch it
          let resolvedUser = userMap[messagePayload.userId]
          if (!resolvedUser) {
            console.log(`Username not in map for user ${messagePayload.userId}, fetching...`)
            fetchUsername(messagePayload.userId) // Async fetch, will update userMap
            resolvedUser = `User ${messagePayload.userId}` // Temporary until fetch completes
          }

          const transformedMessage = {
            user: resolvedUser,
            content: messagePayload.messageString,
            timestamp: timestamp,
          }
          console.log("✓ Transformed message:", transformedMessage)

          // Add message to the specific room
          const roomIdStr = String(messagePayload.roomId)
          setMessagesByRoom((prev) => ({
            ...prev,
            [roomIdStr]: [...(prev[roomIdStr] || []), transformedMessage],
          }))
        } catch (error) {
          console.error("Error processing message:", error)
        }
        break

      case user_url.ws.chat.listRooms.funcId:
        console.log("Setting rooms:", payloadReceived.payload)
        const receivedRooms = payloadReceived.payload as TypeRoomSchema[]
        console.log("Number of rooms received:", receivedRooms?.length)
        if (Array.isArray(receivedRooms)) {
          receivedRooms.forEach(room => {
            console.log(`  - Room ${room.roomId}: "${room.roomName}" (type: ${room.roomType})`)
          })
        }
        setRooms(payloadReceived.payload)
        // If we're waiting to open a DM to a specific user, try to select it now
        if (pendingDMTargetId != null && Array.isArray(receivedRooms)) {
          const dm = receivedRooms.find(r => {
            if (r.roomType !== 2 || typeof r.roomName !== 'string') return false
            if (!r.roomName.startsWith('DM ')) return false
            const parts = r.roomName.split(' ')
            if (parts.length !== 3) return false
            const a = Number(parts[1]); const b = Number(parts[2])
            if (Number.isNaN(a) || Number.isNaN(b)) return false
            // roomName uses sorted ids, so just check both are present
            const hasSelf = (a === selfUserId) || (b === selfUserId)
            const hasTarget = (a === pendingDMTargetId) || (b === pendingDMTargetId)
            return hasSelf && hasTarget
          })
          if (dm) {
            handleSelectRoom(dm.roomId)
            setPendingDMTargetId(null)
          }
        }
        
        // Fetch room data for all rooms to populate userMap with all users
        const roomList = payloadReceived.payload as TypeRoomSchema[]
        if (Array.isArray(roomList)) {
          console.log("Fetching data for", roomList.length, "rooms to populate usernames")
          roomList.forEach((room: TypeRoomSchema, index: number) => {
            // Stagger requests slightly to avoid overwhelming the server
            setTimeout(() => {
              sendToSocket(user_url.ws.chat.getRoomData.funcId, { roomId: room.roomId })
            }, index * 50)
          })
          
          // Removed aggressive pre-fetch of arbitrary user IDs (1-10) to reduce load.
          // Usernames now fetched on-demand via user_connected events, profile opens, DMs, invites.
        }
        break

      case user_url.ws.chat.joinRoom.funcId:
        try {
          console.log("Joined room - full payload:", JSON.stringify(payloadReceived.payload, null, 2))

          // joinRoom only returns RoomEventSchema { user, roomId } - no messages!
          // The backend doesn't send message history, so we keep what we have in memory
          const payload = payloadReceived.payload

          if (payload.roomId) {
            const roomIdStr = String(payload.roomId)
            console.log("Successfully joined room:", roomIdStr)

            // Check if we have messages for this room already
            if (messagesByRoom[roomIdStr] && messagesByRoom[roomIdStr].length > 0) {
              console.log("Found", messagesByRoom[roomIdStr].length, "messages in memory for this room")
            } else {
              console.log("No messages in memory for this room - starting fresh")
              // Initialize empty message array for this room if it doesn't exist
              setMessagesByRoom((prev) => ({
                ...prev,
                [roomIdStr]: prev[roomIdStr] || [],
              }))
            }

            // When someone joins the current room, refresh room data to update user list
            // But only if it's not us (to avoid double-refresh since handleSelectRoom already calls it)
            if (Number(payload.roomId) === currentRoomId && typeof payload.user === 'number' && payload.user !== selfUserId) {
              console.log(`[joinRoom] User ${payload.user} joined our current room ${payload.roomId}, refreshing user list`)
              // Another user joined our room - refresh to get updated list
              sendToSocket(user_url.ws.chat.getRoomData.funcId, { roomId: Number(payload.roomId) })
            } else if (Number(payload.roomId) === currentRoomId && payload.user === selfUserId) {
              console.log(`[joinRoom] We joined room ${payload.roomId} (already refreshed by handleSelectRoom)`)
            }
          }
        } catch (error) {
          console.error("Error processing join room:", error)
        }
        break

      case user_url.ws.chat.addRoom.funcId:
        // Check if room creation was successful
        if (payloadReceived.code === 0) {
          console.log("Room added, refreshing list")
          sendToSocket(user_url.ws.chat.listRooms.funcId, {})
        } else {
          // Error creating room
          const errorMsg = payloadReceived.payload?.message || 
                          payloadReceived.payload?.error || 
                          "Failed to create room. Please check room name (min 3 characters, alphanumeric only)."
          console.error("Failed to create room:", errorMsg)
          if (showToast) {
            showToast(errorMsg, 'error')
          }
        }
        break

      case user_url.ws.chat.addUserToRoom.funcId:
        // This event represents an invite (user state INVITED). Do not show in members yet.
        // Optionally ensure we know the invitee's username for later display.
        try {
          const payload = payloadReceived.payload as any // { user: number, roomId: number }
          console.log("Invite sent to user for room:", payload)
          if (payload && typeof payload.user === 'number') {
            if (!userMap[payload.user]) fetchUsername(payload.user)
          }
        } catch (e) {
          console.error('Error handling addUserToRoom event:', e)
        }
        break

      case user_url.ws.chat.getRoomData.funcId:
        try {
          console.log("Received full room data:", payloadReceived.payload)
          const roomData = payloadReceived.payload as any // FullRoomInfoSchema
          const roomIdStr = String(roomData.room.roomId)

          // Build user map from provided users array
          if (Array.isArray(roomData.users)) {
            const newMap: Record<number, string> = {}
            roomData.users.forEach((u: any) => {
              if (u && typeof u.id === 'number' && typeof u.username === 'string') {
                newMap[u.id] = u.username
              }
            })
            setUserMap((prev) => ({ ...prev, ...newMap }))
            
            // Store only JOINED users for the current room if this is the active room
            if (Number(roomIdStr) === currentRoomId) {
              if (Array.isArray(roomData.userConnections)) {
                console.log(`[getRoomData] Filtering users for room ${roomIdStr}`)
                console.log(`[getRoomData] ChatRoomUserAccessType.JOINED = ${ChatRoomUserAccessType.JOINED}`)
                console.log(`[getRoomData] userConnections:`, JSON.stringify(roomData.userConnections))
                console.log(`[getRoomData] all users:`, JSON.stringify(roomData.users))
                
                const joinedIds = new Set(
                  roomData.userConnections
                    .filter((uc: any) => {
                      const isJoined = uc && uc.userState === ChatRoomUserAccessType.JOINED
                      console.log(`[getRoomData] User ${uc?.userId} state=${uc?.userState} isJoined=${isJoined}`)
                      return isJoined
                    })
                    .map((uc: any) => uc.userId)
                )
                console.log(`[getRoomData] joinedIds:`, Array.from(joinedIds))
                
                const joinedUsers = (roomData.users || []).filter((u: any) => joinedIds.has(u.id))
                console.log(`[getRoomData] Final joinedUsers:`, JSON.stringify(joinedUsers))
                setCurrentRoomUsers(joinedUsers)
              } else {
                // Fallback: if no userConnections provided, do not over-include
                console.log(`[getRoomData] No userConnections array, using all users`)
                setCurrentRoomUsers(roomData.users || [])
              }
            }
          }

          // Map messages (if any) using userMap/newMap
          if (Array.isArray(roomData.messages)) {
            const roomMessages = roomData.messages
              .filter((msg: TypeStoredMessageSchema) => typeof msg.userId === 'number')
              .map((msg: TypeStoredMessageSchema) => ({
                user: (roomData.users && roomData.users.find((u: any) => u.id === msg.userId)?.username) || userMap[msg.userId] || `User ${msg.userId}`,
                content: msg.messageString,
                timestamp: new Date(msg.messageDate * 1000).toISOString(),
              }))

            setMessagesByRoom((prev) => ({
              ...prev,
              [roomIdStr]: roomMessages,
            }))
          } else {
            // Ensure room has an empty array
            setMessagesByRoom((prev) => ({ ...prev, [roomIdStr]: prev[roomIdStr] || [] }))
          }
        } catch (err) {
          console.error("Error processing getRoomData:", err)
        }
        break

      case user_url.ws.users.confirmFriendship.funcId:
        console.log("Friendship accepted response:", payloadReceived)
        if (payloadReceived.code === 0) {
          console.log("✅ Friendship request accepted successfully")
          // Refresh the connections list to update UI
          sendToSocket(user_url.ws.users.fetchUserConnections.funcId, null)
        } else {
          console.error("❌ Failed to accept friendship:", payloadReceived)
        }
        break

      case user_url.ws.users.denyFriendship.funcId:
        console.log("Friendship denied response:", payloadReceived)
        if (payloadReceived.code === 0) {
          console.log("✅ Friendship request denied successfully")
          // Refresh the connections list to update UI
          sendToSocket(user_url.ws.users.fetchUserConnections.funcId, null)
        } else {
          console.error("❌ Failed to deny friendship:", payloadReceived)
        }
        break

      case user_url.ws.chat.sendDirectMessage.funcId:
        console.log("sendDirectMessage response:", payloadReceived)
        if (payloadReceived.code === 0 && payloadReceived.payload) {
          console.log("✅ Direct message sent successfully")
          const dmPayload = payloadReceived.payload as { roomId: number }
          const roomIdStr = String(dmPayload.roomId)
          
          // First, refresh the room list to get the new DM room
          sendToSocket(user_url.ws.chat.listRooms.funcId, {})
          
          // Then fetch room data to get usernames and messages
          setTimeout(() => {
            sendToSocket(user_url.ws.chat.getRoomData.funcId, { roomId: Number(dmPayload.roomId) })
          }, 100)
          
          // Finally switch to the DM room
          setTimeout(() => {
            setCurrentRoomId(dmPayload.roomId as number)
          }, 200)
        } else {
          console.error("❌ Failed to send direct message:", payloadReceived)
          if (showToast) {
            const errorMsg = payloadReceived.payload?.message || payloadReceived.payload?.error || `Failed to send DM (code: ${payloadReceived.code})`
            showToast(errorMsg, 'error')
          }
        }
        break

      case "user_connected":
        console.log("User connected event:", payloadReceived.payload)
        if (payloadReceived.code === 0 && payloadReceived.payload) {
          const userId = payloadReceived.payload.userId
          if (userId && typeof userId === 'number') {
            console.log(`User ${userId} connected, fetching username...`)
            fetchUsername(userId)
            // Mark online in current room list if present
            setCurrentRoomUsers((prev) => prev.map((u) => u.id === userId ? { ...u, onlineStatus: 1 } : u))
          }
        }
        break

      case "user_disconnected":
        console.log("User disconnected event:", payloadReceived.payload)
        if (payloadReceived.payload && typeof payloadReceived.payload.userId === 'number') {
          const userId = payloadReceived.payload.userId
          // Mark offline in current room list if present
          setCurrentRoomUsers((prev) => prev.map((u) => u.id === userId ? { ...u, onlineStatus: 0 } : u))
        }
        break

      case user_url.ws.users.requestUserProfileData.funcId:
        console.log("[requestUserProfileData] Response received:", payloadReceived)
        if (payloadReceived.code === 0 && payloadReceived.payload) {
          const profile = payloadReceived.payload
          if (profile.id && profile.username) {
            console.log(`[requestUserProfileData] Adding to userMap: ${profile.id} -> ${profile.username}`)
            setUserMap((prev) => ({ ...prev, [profile.id]: profile.username }))
          }
        } else {
          console.warn("[requestUserProfileData] Failed to fetch profile:", payloadReceived)
        }
        break

      default:
        console.log("Unhandled funcId:", payloadReceived.funcId)
    }
  }, [payloadReceived, sendToSocket])
  // Note: userMap removed from dependencies to prevent infinite loop
  // userMap is only read inside the effect, not used as a trigger

  // Helper function to fetch username by userId via WebSocket
  const fetchUsername = useCallback(async (userId: number): Promise<string | null> => {
    try {
      console.log(`[fetchUsername] Fetching username for user ${userId} via WebSocket...`)
      sendToSocket(user_url.ws.users.requestUserProfileData.funcId, userId)
      // The response will be handled in the payloadReceived effect
      return null // We'll update userMap when the response arrives
    } catch (err) {
      console.warn(`[fetchUsername] Error fetching username for user ${userId}:`, err)
    }
    return null
  }, [sendToSocket])

  useEffect(() => {
    console.log("Requesting room list and user connections on mount")
    sendToSocket(user_url.ws.chat.listRooms.funcId, {})
    sendToSocket(user_url.ws.users.fetchUserConnections.funcId, null)
  }, [sendToSocket])


  const parseSlashCommand = (input: string) => {
  if (!input.startsWith("/")) return null

  const parts = input.trim().split(/\s+/)
  const command = parts[0].substring(1).toLowerCase()
  const args = parts.slice(1)

  return { command, args }
}

  /* -------------------- Handlers -------------------- */
 const handleSendMessage = useCallback(
  (content: string) => {
    if (!currentRoomId) return
    const commandInfo = parseSlashCommand(content)

    // ✅ Handle slash commands
    if (commandInfo) {
      const { command, args } = commandInfo
      console.log("Slash command detected:", command, args)

      switch (command) {
        case "me":
          // Send a special “emote-style” message
          sendToSocket(user_url.ws.chat.sendMessage.funcId, {
            roomId: currentRoomId,
            messageString: `*${args.join(" ")}*`,
          })
          break

        case "whisper":
        case "w":
          if (showToast) {
            showToast("Private whisper feature is not implemented yet.", 'error')
          }
          break

        case "invite":
          if (args.length !== 1) {
            if (showToast) {
              showToast("Usage: /invite <username or userId>", 'error')
            }
            return
          }
          if (currentRoomType === 2) {
            if (showToast) {
              showToast("Cannot invite users into a direct message room.", 'error')
            }
            return
          }
          // Resolve username to userId
          const usernameOrId = args[0]
          const isNumericInput = /^\d+$/.test(usernameOrId)
          let userIdToInvite: number | null = null
          
          if (isNumericInput) {
            userIdToInvite = Number(usernameOrId)
            sendToSocket(user_url.ws.chat.addUserToRoom.funcId, { 
              roomId: currentRoomId, 
              user_to_add: userIdToInvite 
            })
          } else {
            // First, look up username in userMap
            console.log("Looking for username:", usernameOrId, "in userMap:", userMap)
            const foundUser = Object.entries(userMap).find(([, uname]) => 
              uname.toLowerCase() === usernameOrId.toLowerCase()
            )
            
            if (foundUser) {
              userIdToInvite = Number(foundUser[0])
              sendToSocket(user_url.ws.chat.addUserToRoom.funcId, { 
                roomId: currentRoomId, 
                user_to_add: userIdToInvite 
              })
            } else {
              // Not in cache - search for the user by username
              console.log(`Searching for user: ${usernameOrId}`)
              
              // Create a pending invite that will be sent once we get the search response
              const handleSearchResponse = (e: MessageEvent) => {
                try {
                  const data = JSON.parse(e.data)
                  if (data.funcId === user_url.ws.users.requestUserProfileData.funcId) {
                    socket.current?.removeEventListener('message', handleSearchResponse)
                    
                    if (data.code === 0 && data.payload?.id) {
                      const foundUserId = data.payload.id
                      console.log(`Found user ${usernameOrId} with ID ${foundUserId}`)
                      sendToSocket(user_url.ws.chat.addUserToRoom.funcId, { 
                        roomId: currentRoomId, 
                        user_to_add: foundUserId 
                      })
                    } else {
                      if (showToast) {
                        showToast(`User "${usernameOrId}" not found. Please check the username and try again.`, 'error')
                      }
                    }
                  }
                } catch (err) {
                  console.error("Error handling search response:", err)
                }
              }
              
              socket.current?.addEventListener('message', handleSearchResponse)
              
              // Send search request
              sendToSocket(user_url.ws.users.requestUserProfileData.funcId, usernameOrId)
              
              // Timeout after 5 seconds
              setTimeout(() => {
                socket.current?.removeEventListener('message', handleSearchResponse)
              }, 5000)
            }
          }
          break

        case "help":
          if (showToast) {
            showToast("Commands: /me, /whisper, /invite, /help", 'success')
          }
          break

        default:
          if (showToast) {
            showToast(`Unknown command: /${command}`, 'error')
          }
      }

      return // Don't send the raw message
    }

    // ✅ Regular chat message
    sendToSocket(user_url.ws.chat.sendMessage.funcId, {
      roomId: currentRoomId,
      messageString: content,
    })
  },
  [currentRoomId, sendToSocket, userMap],
)

  const handleSelectRoom = useCallback(
    (roomId: number) => {
      const room = rooms.find((r) => r.roomId === roomId)
      console.log("Selecting room:", roomId, room)
      setCurrentRoomId(roomId)
      setCurrentRoomName(computeRoomDisplayName(room))
      setCurrentRoomType(room?.roomType ?? null)
      setCurrentRoomUsers([]) // Clear users list while loading
      // First join the room (so we're a member)
      sendToSocket(user_url.ws.chat.joinRoom.funcId, { roomId })
      // Then get room data after a short delay to ensure join is processed
      setTimeout(() => {
        sendToSocket(user_url.ws.chat.getRoomData.funcId, { roomId })
      }, 100)
    },
    [rooms, sendToSocket, computeRoomDisplayName],
  )

  const handleCreateRoom = useCallback(
    (roomName: string) => {
      console.log("[v0] handleCreateRoom called with roomName:", roomName)
      console.log("[v0] Socket current:", socket.current)
      console.log("[v0] Socket readyState:", socket.current?.readyState)
      console.log("[v0] Creating room with funcId:", user_url.ws.chat.addRoom.funcId)
      sendToSocket(user_url.ws.chat.addRoom.funcId, { roomName, roomType: 1 })
    },
    [sendToSocket, socket],
  )

  const handleRefreshRooms = useCallback(() => {
    console.log("Refreshing rooms")
    sendToSocket(user_url.ws.chat.listRooms.funcId, {})
  }, [sendToSocket])

  const handleInvitePong = useCallback(() => {
    if (!currentRoomId) return
    console.log("Inviting to pong in room:", currentRoomId)
    // This funcId might not exist yet - adjust based on your endpoints
    if (showToast) {
      showToast("Pong invitation feature not yet implemented", 'error')
    }
  }, [currentRoomId, showToast])

  const handleAcceptFriendship = useCallback(
    (userId: number) => {
      console.log("Accepting friendship request from:", userId)
      sendToSocket(user_url.ws.users.confirmFriendship.funcId, userId)
      // Refresh connections after accepting
      setTimeout(() => {
        sendToSocket(user_url.ws.users.fetchUserConnections.funcId, null)
      }, 500)
    },
    [sendToSocket],
  )

  const handleDenyFriendship = useCallback(
    (userId: number) => {
      console.log("Denying friendship request from:", userId)
      sendToSocket(user_url.ws.users.denyFriendship.funcId, userId)
      // Refresh connections after denying
      setTimeout(() => {
        sendToSocket(user_url.ws.users.fetchUserConnections.funcId, null)
      }, 500)
    },
    [sendToSocket],
  )

  // Sync pending requests and handlers to context (unless in test mode)
  useEffect(() => {
    const testMode = localStorage.getItem('FRIENDSHIP_TEST_MODE') === 'true'
    if (!testMode) {
      setPendingRequests(pendingFriendshipRequests)
    }
  }, [pendingFriendshipRequests, setPendingRequests])

  useEffect(() => {
    setAcceptHandler(() => handleAcceptFriendship)
    setDenyHandler(() => handleDenyFriendship)
  }, [handleAcceptFriendship, handleDenyFriendship, setAcceptHandler, setDenyHandler])

  const handleBlockUser = useCallback((username: string) => {
    setBlockedUsers((prev) => (prev.includes(username) ? prev.filter((u) => u !== username) : [...prev, username]))
  }, [])

  const handleOpenProfile = useCallback((username: string) => {
    console.log("=== Opening profile ===")
    console.log("Username received:", username)

    // Try to extract userId from formats like "User {id}"
    const userIdMatch = username.match(/User (\d+)/)
    if (userIdMatch && userIdMatch[1]) {
      const userId = Number.parseInt(userIdMatch[1], 10)
      if (!isNaN(userId)) {
        setProfileUserId(userId)
        setShowProfileModal(true)
        return
      }
    }

    // If username is a plain username, try to resolve via userMap
    const found = Object.entries(userMap).find(([, uname]) => uname === username)
    if (found) {
      const id = Number(found[0])
      setProfileUserId(id)
      setShowProfileModal(true)
      return
    }

    if (showToast) {
      showToast(`Cannot open profile for ${username} - unknown user`, 'error')
    }
  }, [userMap, showToast])

  const handleStartDM = useCallback(
    (usernameOrId: string | number) => {
      console.log("Starting DM with:", usernameOrId)
      
      // Check if input is a number (userId)
      const isNumeric = typeof usernameOrId === 'number' || /^\d+$/.test(String(usernameOrId))
      let targetUserId: number
      
      if (isNumeric) {
        // Direct userId provided
        targetUserId = typeof usernameOrId === 'number' ? usernameOrId : Number(usernameOrId)
        console.log("Using userId directly:", targetUserId)
      } else {
        // Username provided - look up in userMap
        const found = Object.entries(userMap).find(([, uname]) => uname === usernameOrId)
        if (!found) {
          if (showToast) {
            showToast(`Cannot start DM - user "${usernameOrId}" not found in current session. Try entering their user ID number instead.`, 'error')
          }
          return
        }
        targetUserId = Number(found[0])
        console.log("Resolved username to userId:", targetUserId)
      }
      
      // Send a welcome message to create/open the DM room
      sendToSocket(user_url.ws.chat.sendDirectMessage.funcId, {
        targetUserId,
        messageString: "Started a conversation",
      })
      // Remember we want to switch to this DM when rooms arrive
      setPendingDMTargetId(targetUserId)
      // Nudge a rooms refresh to get the DM in the list quickly
      setTimeout(() => {
        sendToSocket(user_url.ws.chat.listRooms.funcId, {})
      }, 100)
    },
    [sendToSocket, userMap],
  )

  /* -------------------- Render -------------------- */
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 dark:from-gray-900 via-white dark:via-gray-800 to-purple-50 dark:to-gray-900 p-4">
      <div className="w-full max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <RoomList
              rooms={rooms}
              currentRoom={currentRoomId}
              onSelectRoom={handleSelectRoom}
              onCreateRoom={handleCreateRoom}
              onRefreshRooms={handleRefreshRooms}
              onStartDM={handleStartDM}
              selfUserId={selfUserId}
              userMap={userMap}
            />
          </div>

          <div className="md:col-span-2">
            <ChatBox
              messages={messages}
              onSendMessage={handleSendMessage}
              currentRoom={currentRoomId}
              currentRoomName={currentRoomName}
              onInvitePong={handleInvitePong}
              onBlockUser={handleBlockUser}
              blockedUsers={blockedUsers}
              onOpenProfile={handleOpenProfile}
              roomUsers={currentRoomUsers}
            />
          </div>
        </div>
      </div>

      {showProfileModal && profileUserId && (
        <ProfileComponent
          userId={profileUserId}
          isOpen={showProfileModal}
          onClose={() => {
            setShowProfileModal(false)
            setProfileUserId(null)
          }}
          onStartDM={handleStartDM}
          showToast={showToast}
        />
      )}
    </div>
  )
}