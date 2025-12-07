"use client"

import type { TypeStoredMessageSchema, TypeRoomSchema } from "./types/chat-models"
import { useCallback, useEffect, useState, useRef } from "react"
import { user_url } from "@app/shared/api/service/common/endpoints"
import { ChatRoomUserAccessType } from "@app/shared/api/service/chat/db_models"
import { useWebSocket } from "./socketComponent"
import ProfileComponent from "./profileComponent"
import { useFriendshipContext } from "./friendshipContext"
import { ChatBox, RoomList } from "./chat"

/* -------------------- Main Chat Component -------------------- */
export default function ChatInputComponent({
  selfUserId,
  showToast,
  onOpenPongInvite
}: {
  selfUserId: number
  showToast?: (message: string, type: 'success' | 'error') => void
  onOpenPongInvite?: (roomUsers: Array<{ id: number; username: string; onlineStatus?: number }>) => void
}) {
  const { socket, payloadReceived, isConnected, sendMessage } = useWebSocket()
  const {
    setPendingRequests,
    setAcceptHandler,
    setDenyHandler,
    setRoomInvites,
    setAcceptRoomInviteHandler,
    setDeclineRoomInviteHandler,
    setDmInvites,
    setAcceptDmInviteHandler,
    setDeclineDmInviteHandler
  } = useFriendshipContext()
  const [rooms, setRooms] = useState<TypeRoomSchema[]>([])
  const [currentRoomId, setCurrentRoomId] = useState<number | null>(null)
  const sendToSocketRef = useRef<(funcId: string, payload: any, targetContainer?: string) => void>(() => { })
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
        userId?: number  // Added for color mapping
      }>
    >
  >({})
  const [blockedUserIds, setBlockedUserIds] = useState<number[]>([])
  const [profileUserId, setProfileUserId] = useState<number | null>(null)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [userMap, setUserMap] = useState<Record<number, string>>({}) // userId -> username map
  const [pendingFriendshipRequests, setPendingFriendshipRequests] = useState<Array<{ userId: number; username: string; alias?: string | null }>>([])
  const [pendingDMTargetId, setPendingDMTargetId] = useState<number | null>(null)
  const [currentRoomUsers, setCurrentRoomUsers] = useState<Array<{ id: number; username: string; onlineStatus?: number }>>([])
  const [pendingProfileLookup, setPendingProfileLookup] = useState<string | null>(null)
  // Track rooms where we have been invited (INVITED state)
  const [pendingRoomInvites, setPendingRoomInvites] = useState<Array<{ roomId: number; roomName: string; inviterId: number; inviterUsername: string }>>([])
  // Track DMs where someone messaged us (we have INVITED state in DM room)
  const [pendingDmInvites, setPendingDmInvites] = useState<Array<{ roomId: number; oderId: number; username: string }>>([])

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
    } catch { }
    return room?.roomName || null
  }, [selfUserId, userMap])

  const sendToSocket = useCallback(
    (funcId: string, payload: any, targetContainer?: string) => {
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

      const sent = sendMessage(toSend)
      if (!sent) {
        console.warn("[v0] Socket not connected, message queued:", funcId)
      }
    },
    [sendMessage],
  )

  // Keep sendToSocketRef updated
  useEffect(() => {
    sendToSocketRef.current = sendToSocket
  }, [sendToSocket])

  /* -------------------- Handle Incoming Messages -------------------- */
  useEffect(() => {
    if (!payloadReceived) return

    // Only log chat/user messages, not pong updates
    if (!payloadReceived.funcId?.includes('game_state') && !payloadReceived.source_container?.includes('pong')) {
      console.log("[Chat] Received:", payloadReceived.funcId)
    }

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

        // Filter for pending requests where someone else requested friendship with US
        // (conn.friendId === selfUserId means we are the target, not the initiator)
        const pending = connections
          .filter((conn: any) => conn.status === 1 && conn.friendId === selfUserId) // Only show requests where we're the target
          .map((conn: any) => ({
            userId: conn.id,
            username: conn.username,
            alias: conn.alias,
          }))
        setPendingFriendshipRequests(pending)
        console.log("Pending friendship requests (received):", pending)

        // Extract blocked users (status === 3) - users WE have blocked
        const blocked = connections
          .filter((conn: any) => conn.status === 3 && conn.userId === selfUserId) // We initiated the block
          .map((conn: any) => conn.id)
        setBlockedUserIds(blocked)
        console.log("Blocked users:", blocked)
        break

      case user_url.ws.users.blockUser.funcId:
      case user_url.ws.users.unblockUser.funcId:
        // Refresh user connections to get updated blocked list
        console.log("Block/unblock response, refreshing connections")
        if (payloadReceived.code === 0) {
          sendToSocket(user_url.ws.users.fetchUserConnections.funcId, null)
        }
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
            userId: messagePayload.userId,  // For color mapping
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

      case user_url.ws.chat.leaveRoom.funcId:
        try {
          console.log("Leave room response - full payload:", JSON.stringify(payloadReceived.payload, null, 2))
          const payload = payloadReceived.payload as { user: number; roomId: number } | { message: string }

          if ('roomId' in payload && payloadReceived.code === 0) {
            const roomIdStr = String(payload.roomId)
            const leftRoomId = Number(payload.roomId)
            console.log("Successfully left room:", roomIdStr)

            // If another user left the room we're in, refresh the user list
            if (leftRoomId === currentRoomId && 'user' in payload && payload.user !== selfUserId) {
              console.log(`[leaveRoom] User ${payload.user} left our current room ${payload.roomId}, refreshing user list`)
              sendToSocket(user_url.ws.chat.getRoomData.funcId, { roomId: leftRoomId })
            }

            // Remove the room from our list if we left
            if ('user' in payload && payload.user === selfUserId) {
              console.log(`[leaveRoom] We left room ${leftRoomId}, removing from list`)
              setRooms(prev => {
                const filtered = prev.filter(r => r.roomId !== leftRoomId)
                console.log(`[leaveRoom] Rooms before: ${prev.length}, after: ${filtered.length}`)
                return filtered
              })
              // Clear message history for this room
              setMessagesByRoom(prev => {
                const newState = { ...prev }
                delete newState[roomIdStr]
                return newState
              })
              // Refresh the room list from server to ensure consistency
              sendToSocket(user_url.ws.chat.listRooms.funcId, {})
              if (showToast) {
                showToast("You have left the room.", 'success')
              }
            }
          } else if (payloadReceived.code !== 0) {
            const errorMsg = 'message' in payload ? payload.message : "Failed to leave room."
            console.error("Failed to leave room:", errorMsg)
            if (showToast) {
              showToast(errorMsg, 'error')
            }
          }
        } catch (error) {
          console.error("Error processing leave room:", error)
        }
        break

      case user_url.ws.chat.addUserToRoom.funcId:
        // This event represents an invite (user state INVITED). Do not show in members yet.
        // If the invited user is us, fetch room data to see the invite notification
        try {
          const payload = payloadReceived.payload as any // { user: number, roomId: number }
          console.log("Invite sent to user for room:", payload)
          if (payload && typeof payload.user === 'number') {
            if (!userMap[payload.user]) fetchUsername(payload.user)

            // If WE were invited, fetch the room data to trigger the invite notification
            if (payload.user === selfUserId && typeof payload.roomId === 'number') {
              console.log("[addUserToRoom] We were invited to room", payload.roomId, "- fetching room data")
              sendToSocket(user_url.ws.chat.getRoomData.funcId, { roomId: payload.roomId })
            }
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

            // Check if we (selfUserId) are INVITED to this room
            // roomType: 0 = public, 1 = private, 2 = DM
            if (Array.isArray(roomData.userConnections)) {
              const myConnection = roomData.userConnections.find((uc: any) => uc.userId === selfUserId)

              if (roomData.room.roomType === 2) {
                // DM room - check if we're INVITED (someone messaged us)
                if (myConnection && myConnection.userState === ChatRoomUserAccessType.INVITED) {
                  // Find the other user in the DM
                  const otherConnection = roomData.userConnections.find((uc: any) => uc.userId !== selfUserId)
                  const otherId = otherConnection?.userId || 0
                  const otherUsername = newMap[otherId] || userMap[otherId] || `User ${otherId}`

                  console.log(`[getRoomData] We have a new DM from ${otherUsername} (userId: ${otherId})`)

                  // Add to pending DM invites if not already there
                  setPendingDmInvites(prev => {
                    const exists = prev.some(inv => inv.roomId === roomData.room.roomId)
                    if (!exists) {
                      return [...prev, {
                        roomId: roomData.room.roomId,
                        oderId: otherId,
                        username: otherUsername
                      }]
                    }
                    return prev
                  })
                } else if (myConnection && myConnection.userState === ChatRoomUserAccessType.JOINED) {
                  // We've opened this DM, remove from pending
                  setPendingDmInvites(prev => prev.filter(inv => inv.roomId !== roomData.room.roomId))
                }
              } else {
                // Public/private room
                if (myConnection && myConnection.userState === ChatRoomUserAccessType.INVITED) {
                  // Find who else is in the room (likely the inviter - first JOINED user)
                  const inviterConnection = roomData.userConnections.find((uc: any) =>
                    uc.userId !== selfUserId && uc.userState === ChatRoomUserAccessType.JOINED
                  )
                  const inviterId = inviterConnection?.userId || 0
                  const inviterUsername = newMap[inviterId] || userMap[inviterId] || `User ${inviterId}`

                  console.log(`[getRoomData] We're INVITED to room ${roomData.room.roomName} by ${inviterUsername}`)

                  // Add to pending room invites if not already there
                  setPendingRoomInvites(prev => {
                    const exists = prev.some(inv => inv.roomId === roomData.room.roomId)
                    if (!exists) {
                      return [...prev, {
                        roomId: roomData.room.roomId,
                        roomName: roomData.room.roomName,
                        inviterId,
                        inviterUsername
                      }]
                    }
                    return prev
                  })
                } else if (myConnection && myConnection.userState === ChatRoomUserAccessType.JOINED) {
                  // We've joined this room, remove from pending invites if present
                  setPendingRoomInvites(prev => prev.filter(inv => inv.roomId !== roomData.room.roomId))
                }
              }
            }

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
                userId: msg.userId,  // For color mapping
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

            // If we were waiting to open this user's profile, open it now
            if (pendingProfileLookup === profile.username) {
              console.log(`[requestUserProfileData] Opening profile for ${profile.username} (id: ${profile.id})`)
              setProfileUserId(profile.id)
              setShowProfileModal(true)
              setPendingProfileLookup(null)
            }
          }
        } else {
          console.warn("[requestUserProfileData] Failed to fetch profile:", payloadReceived)
          // If we were waiting for this lookup, show error
          if (pendingProfileLookup) {
            if (showToast) {
              showToast(`Cannot open profile for ${pendingProfileLookup} - user not found`, 'error')
            }
            setPendingProfileLookup(null)
          }
        }
        break

      default:
        // Only log unhandled messages that aren't from pong (to reduce spam)
        if (payloadReceived.source_container !== 'pong') {
          console.log("Unhandled funcId:", payloadReceived.funcId)
        }
    }
  }, [payloadReceived, sendToSocket])
  // Note: userMap removed from dependencies to prevent infinite loop
  // userMap is only read inside the effect, not used as a trigger

  // Helper function to fetch username by userId via WebSocket
  const fetchUsername = useCallback((userId: number) => {
    try {
      console.log(`[fetchUsername] Fetching username for user ${userId} via WebSocket...`)
      sendToSocketRef.current(user_url.ws.users.requestUserProfileData.funcId, userId)
    } catch (err) {
      console.warn(`[fetchUsername] Error fetching username for user ${userId}:`, err)
    }
  }, [])

  useEffect(() => {
    console.log("Requesting room list and user connections on mount")
    sendToSocket(user_url.ws.chat.listRooms.funcId, {})
    sendToSocket(user_url.ws.users.fetchUserConnections.funcId, null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  const parseSlashCommand = (input: string) => {
    if (!input.startsWith("/")) return null

    const parts = input.trim().split(/\s+/)
    const command = parts[0]!.substring(1).toLowerCase()
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
            if (args.length < 1) {
              if (showToast) {
                showToast("Usage: /invite <username1> [username2] [username3] ...", 'error')
              }
              return
            }
            if (currentRoomType === 2) {
              if (showToast) {
                showToast("Cannot invite users into a direct message room.", 'error')
              }
              return
            }

            // Helper function to invite a single user
            const inviteUser = (usernameOrId: string) => {
              const isNumericInput = /^\d+$/.test(usernameOrId)

              if (isNumericInput) {
                const userIdToInvite = Number(usernameOrId)
                sendToSocket(user_url.ws.chat.addUserToRoom.funcId, {
                  roomId: currentRoomId,
                  user_to_add: userIdToInvite
                })
                if (showToast) {
                  showToast(`Invited user ID ${userIdToInvite}`, 'success')
                }
              } else {
                // First, look up username in userMap
                console.log("Looking for username:", usernameOrId, "in userMap:", userMap)
                const foundUser = Object.entries(userMap).find(([, uname]) =>
                  uname.toLowerCase() === usernameOrId.toLowerCase()
                )

                if (foundUser) {
                  const userIdToInvite = Number(foundUser[0])
                  sendToSocket(user_url.ws.chat.addUserToRoom.funcId, {
                    roomId: currentRoomId,
                    user_to_add: userIdToInvite
                  })
                  if (showToast) {
                    showToast(`Invited ${usernameOrId}`, 'success')
                  }
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
                          if (showToast) {
                            showToast(`Invited ${usernameOrId}`, 'success')
                          }
                        } else {
                          if (showToast) {
                            showToast(`User "${usernameOrId}" not found.`, 'error')
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
            }

            // Invite all specified users
            args.forEach((userArg, index) => {
              // Stagger invites slightly to avoid race conditions
              setTimeout(() => inviteUser(userArg), index * 100)
            })

            if (args.length > 1 && showToast) {
              showToast(`Inviting ${args.length} users...`, 'success')
            }
            break

          case "debug":
            // Send raw WebSocket message for debugging
            if (args.length === 0) {
              if (showToast) {
                showToast("Usage: /debug <raw JSON string>", 'error')
              }
              return
            }
            try {
              const rawMessage = args.join(" ")
              if (socket.current?.readyState === WebSocket.OPEN) {
                socket.current.send(rawMessage)
                if (showToast) {
                  showToast("Debug message sent", 'success')
                }
              } else {
                if (showToast) {
                  showToast("WebSocket not connected", 'error')
                }
              }
            } catch (err) {
              if (showToast) {
                showToast(`Error sending debug message: ${err}`, 'error')
              }
            }
            break

          case "help":
            if (showToast) {
              showToast("Commands: /me, /whisper, /invite (supports multiple users), /debug, /help. Use ↑↓ to browse command history.", 'success')
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
      // Get room data - join response should trigger room data update automatically
      sendToSocket(user_url.ws.chat.getRoomData.funcId, { roomId })
    },
    [rooms, computeRoomDisplayName],
  )

  const handleLeaveRoom = useCallback(
    (roomId: number) => {
      console.log("Leaving room:", roomId)
      sendToSocket(user_url.ws.chat.leaveRoom.funcId, { roomId })
      // If leaving the current room, clear the state
      if (roomId === currentRoomId) {
        setCurrentRoomId(null)
        setCurrentRoomName(null)
        setCurrentRoomType(null)
        setCurrentRoomUsers([])
        // Messages are cleared in the leaveRoom response handler via setMessagesByRoom
      }
    },
    [currentRoomId],
  )

  const handleCreateRoom = useCallback(
    (roomName: string) => {
      console.log("[v0] handleCreateRoom called with roomName:", roomName)
      console.log("[v0] Creating room with funcId:", user_url.ws.chat.addRoom.funcId)
      sendToSocket(user_url.ws.chat.addRoom.funcId, { roomName })
    },
    [],
  )

  const handleRefreshRooms = useCallback(() => {
    console.log("Refreshing rooms")
    sendToSocket(user_url.ws.chat.listRooms.funcId, {})
  }, [])

  const handleInvitePong = useCallback((roomUsers: Array<{ id: number; username: string; onlineStatus?: number }>) => {
    if (!currentRoomId) return
    console.log("Inviting to pong in room:", currentRoomId)
    if (onOpenPongInvite) {
      onOpenPongInvite(roomUsers)
    } else if (showToast) {
      showToast("Pong invitation feature not yet implemented", 'error')
    }
  }, [currentRoomId, showToast, onOpenPongInvite])

  const handleAcceptFriendship = useCallback(
    (userId: number) => {
      console.log("Accepting friendship request from:", userId)
      sendToSocket(user_url.ws.users.confirmFriendship.funcId, userId)
      // Refresh connections after accepting
      setTimeout(() => {
        sendToSocket(user_url.ws.users.fetchUserConnections.funcId, null)
      }, 500)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [],
  )

  const handleDenyFriendship = useCallback(
    (userId: number) => {
      console.log("Denying friendship request from:", userId)
      sendToSocket(user_url.ws.users.denyFriendship.funcId, userId)
      // Refresh connections after denying
      setTimeout(() => {
        sendToSocket(user_url.ws.users.fetchUserConnections.funcId, null)
      }, 500)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [],
  )

  // Handler for accepting a room invite (join the room)
  const handleAcceptRoomInvite = useCallback(
    (roomId: number) => {
      console.log("Accepting room invite, joining room:", roomId)
      sendToSocket(user_url.ws.chat.joinRoom.funcId, { roomId })
      // Remove from pending invites
      setPendingRoomInvites(prev => prev.filter(inv => inv.roomId !== roomId))
      // Select the room and open it
      setCurrentRoomId(roomId)
      // Refresh rooms list and get room data
      setTimeout(() => {
        sendToSocket(user_url.ws.chat.listRooms.funcId, {})
        sendToSocket(user_url.ws.chat.getRoomData.funcId, { roomId })
      }, 300)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [],
  )

  // Handler for declining a room invite (leave/dismiss the invite)
  const handleDeclineRoomInvite = useCallback(
    (roomId: number) => {
      console.log("Declining room invite for room:", roomId)
      // Just remove from our local list - the INVITED state will remain on server
      // but user won't see the notification anymore
      setPendingRoomInvites(prev => prev.filter(inv => inv.roomId !== roomId))
    },
    [],
  )

  // Handler for accepting a DM invite (join/open the DM room)
  const handleAcceptDmInvite = useCallback(
    (roomId: number) => {
      console.log("Accepting DM invite, opening room:", roomId)
      sendToSocket(user_url.ws.chat.joinRoom.funcId, { roomId })
      // Remove from pending DM invites
      setPendingDmInvites(prev => prev.filter(inv => inv.roomId !== roomId))
      // Select the room
      setCurrentRoomId(roomId)
      // Refresh room data
      setTimeout(() => {
        sendToSocket(user_url.ws.chat.getRoomData.funcId, { roomId })
      }, 100)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [],
  )

  // Handler for declining a DM invite (dismiss notification)
  const handleDeclineDmInvite = useCallback(
    (roomId: number) => {
      console.log("Declining DM invite for room:", roomId)
      // Just remove from our local list
      setPendingDmInvites(prev => prev.filter(inv => inv.roomId !== roomId))
    },
    [],
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

  // Sync room invites and handlers to context
  useEffect(() => {
    setRoomInvites(pendingRoomInvites)
  }, [pendingRoomInvites, setRoomInvites])

  useEffect(() => {
    setAcceptRoomInviteHandler(() => handleAcceptRoomInvite)
    setDeclineRoomInviteHandler(() => handleDeclineRoomInvite)
  }, [handleAcceptRoomInvite, handleDeclineRoomInvite, setAcceptRoomInviteHandler, setDeclineRoomInviteHandler])

  // Sync DM invites and handlers to context
  useEffect(() => {
    setDmInvites(pendingDmInvites)
  }, [pendingDmInvites, setDmInvites])

  useEffect(() => {
    setAcceptDmInviteHandler(() => handleAcceptDmInvite)
    setDeclineDmInviteHandler(() => handleDeclineDmInvite)
  }, [handleAcceptDmInvite, handleDeclineDmInvite, setAcceptDmInviteHandler, setDeclineDmInviteHandler])

  const handleBlockUser = useCallback((userId: number) => {
    const isCurrentlyBlocked = blockedUserIds.includes(userId)
    if (isCurrentlyBlocked) {
      // Unblock - call server API
      console.log("Unblocking user:", userId)
      sendToSocket(user_url.ws.users.unblockUser.funcId, userId)
    } else {
      // Block - call server API
      console.log("Blocking user:", userId)
      sendToSocket(user_url.ws.users.blockUser.funcId, userId)
    }
    // Optimistically update local state
    setBlockedUserIds((prev) =>
      isCurrentlyBlocked ? prev.filter((id) => id !== userId) : [...prev, userId]
    )
  }, [blockedUserIds, sendToSocket])

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

    // If not found in userMap, try fetching by username from backend
    console.log(`[handleOpenProfile] Username "${username}" not in userMap, fetching by username...`)
    setPendingProfileLookup(username)
    sendToSocketRef.current(user_url.ws.users.requestUserProfileData.funcId, username)
  }, [userMap])

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
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <RoomList
              rooms={rooms}
              currentRoom={currentRoomId}
              onSelectRoom={handleSelectRoom}
              onCreateRoom={handleCreateRoom}
              onRefreshRooms={handleRefreshRooms}
              onLeaveRoom={handleLeaveRoom}
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
              blockedUserIds={blockedUserIds}
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
          showToast={showToast || (() => { })}
        />
      )}
    </div>
  )
}