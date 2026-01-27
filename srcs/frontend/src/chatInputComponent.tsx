"use client"

import type { TypeStoredMessageSchema, TypeRoomSchema } from "./types/chat-models"
import { useCallback, useEffect, useState, useRef } from "react"
import { user_url } from "@app/shared/api/service/common/endpoints"
import { ChatRoomUserAccessType } from "@app/shared/api/service/chat/db_models"
import { useWebSocket } from "./socketComponent"
import ProfileComponent from "./profileComponent"
import { useFriendshipContext } from "./friendshipContext"
import { ChatBox, ChatMessage, RoomList } from "./chat"
import { HandlerResult } from "./socketComponent"
import user, { PublicUserDataType } from "@app/shared/api/service/db/user"
import { unsubscribe } from "diagnostics_channel"
import type { TypeListRoomsSchema } from "@app/shared/api/service/chat/db_models"
import { ChatRoomType } from "@app/shared/api/service/chat/chat_interfaces"
import { create } from "zustand"
import { stat } from "fs"

import { useGlobalStore } from "./stores/globalStore"
import { useChatStore } from "./stores/chatStore"

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
  const { sendMessage, subscribe } = useWebSocket()
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
  const [currentRoomName, setCurrentRoomName] = useState<string | null>(null)
  const [currentRoomType, setCurrentRoomType] = useState<number | null>(null)

  const [messagesByRoom, setMessagesByRoom] = useState<
    Record<
      string,
      Array<{
        user: string
        content: string
        timestamp?: string
        userId?: number
      }>
    >
  >({})

  const [blockedUserIds, setBlockedUserIds] = useState<number[]>([])
  const [profileUserId, setProfileUserId] = useState<number | null>(null)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [pendingFriendshipRequests, setPendingFriendshipRequests] = useState<Array<{ userId: number; username: string; alias?: string | null }>>([])
  const [pendingDMTargetId, setPendingDMTargetId] = useState<number | null>(null)
  const [currentRoomUsers, setCurrentRoomUsers] = useState<Array<{ id: number; username: string; onlineStatus?: number }>>([])
  const [pendingProfileLookup, setPendingProfileLookup] = useState<string | null>(null)
  
  
  const onlineUsers = useGlobalStore(state => state.onlineUsers);
  const publicUserDataCache = useGlobalStore(state => state.publicUserDataCache);
  const cachePublicUserData = useGlobalStore(state => state.cachePublicUserData);
  
  const userChatRooms = useChatStore(state => state.userChatRooms);
  const userChatRoomsUIData = useChatStore(state => state.roomUIData);

  const setCurrentRoomData = useChatStore(state => state.setCurrentRoomData);
  const setUserChatRooms = useChatStore(state => state.setUserChatRooms);
  const setSingleUserChatRoom = useChatStore(state => state.setSingleUserChatRoom);

  const incrementUnreadCount = useChatStore(state => state.incrementUnreadCount);
  const resetUnreadCount = useChatStore(state => state.resetUnreadCount);
  const addRoomMessage = useChatStore(state => state.addRoomMessage);
  const leaveRoom = useChatStore(state => state.leaveRoom);

  // const onlineUsersRef = useRef<Set<number>>(new Set())
  const [pendingRoomInvites, setPendingRoomInvites] = useState<Array<{ roomId: number; roomName: string; inviterId: number; inviterUsername: string }>>([])
  const [pendingDmInvites, setPendingDmInvites] = useState<Array<{ roomId: number; oderId: number; username: string }>>([])

  // const userMapRef = useRef(userMap)
  // const currentRoomIdRef = useRef(currentRoomId)
  // const pendingProfileLookupRef = useRef(pendingProfileLookup)

  // useEffect(() => { userMapRef.current = userMap }, [userMap])
  // useEffect(() => { currentRoomIdRef.current = currentRoomId }, [currentRoomId])
  // useEffect(() => { pendingProfileLookupRef.current = pendingProfileLookup }, [pendingProfileLookup])

  // Get messages for current room
  const messages = currentRoomId != null ? messagesByRoom[String(currentRoomId)] || [] : []

  // Helper function to fetch username by userId via WebSocket
  const fetchUsername = useCallback((userId: number) => {
    console.log(`[fetchUsername] Fetching username for user ${userId} via WebSocket...`)
    if (sendMessage(user_url.ws.users.requestUserProfileData, userId) === false) {
      console.warn(`[fetchUsername] Error fetching username for user ${userId}`)
    }
  }, [sendMessage])

  const computeRoomDisplayName = useCallback((room: TypeRoomSchema | undefined | null) => {
    if (!room) return null
    // try {
    //   if (room?.roomType === 2 && typeof room.roomName === 'string' && room.roomName.startsWith('DM ')) {
    //     const parts = room.roomName.split(' ')
    //     if (parts.length === 3) {
    //       const a = Number(parts[1])
    //       const b = Number(parts[2])
    //       if (!Number.isNaN(a) && !Number.isNaN(b)) {
    //         const otherId = a === selfUserId ? b : (b === selfUserId ? a : null)
    //         if (otherId != null) {
    //           return userMap[otherId] || `DM with User ${otherId}`
    //         }
    //       }
    //     }
    //   }
    // } catch { }
    return room?.roomName || null
  }, [selfUserId])

  useEffect(() => {
    console.log("Updated userMap:", publicUserDataCache)
  }, [publicUserDataCache])

  useEffect(() => {
    console.log("Online users updated:", onlineUsers)
  }, [onlineUsers])

  useEffect(() => {
    console.log("User chat rooms updated:", userChatRooms)
  }, [userChatRooms])

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    // unsubs.push(subscribe(user_url.ws.users.fetchUserConnections, (message, schema) => {
    //   switch (message.code) {
    //     case schema.output.Success.code:
    //       console.log(message.payload);
    //       return HandlerResult.Handled;

    //     default:
    //       console.warn(`Unhandled code ${message.code} for fetchUserConnections`);
    //       return HandlerResult.NotHandled;
    //   }
    // }));

    unsubs.push(subscribe(user_url.ws.chat.listRooms, (message, schema) => {
      switch (message.code) {
        case schema.output.FullListGiven.code:
          setUserChatRooms(message.payload);
          return HandlerResult.Handled;

        default:
          return HandlerResult.NotHandled;
      }
    }));

    unsubs.push(subscribe(user_url.ws.chat.getRoomData, (message, schema) => {
      switch (message.code) {
        case schema.output.RoomDataProvided.code:
          setSingleUserChatRoom(message.payload.room);
          cachePublicUserData(message.payload.users);
          setCurrentRoomData(message.payload);
          resetUnreadCount(message.payload.room.roomId);
          return HandlerResult.Handled;

        default:
          return HandlerResult.NotHandled;
      }
    }));

    unsubs.push(subscribe(user_url.ws.chat.sendMessage, (message, schema) => {
      switch (message.code) {
        case schema.output.MessageSent.code:
          const currentRoomId = useChatStore.getState().currentRoomId;
          if (currentRoomId === message.payload.roomId)
            addRoomMessage(message.payload);
          else
            incrementUnreadCount(message.payload.roomId);
          return HandlerResult.Handled;

        default:
          return HandlerResult.NotHandled;
      }
    }));

    unsubs.push(subscribe(user_url.ws.chat.addRoom, (message, schema) => {
      switch (message.code) {
        case schema.output.AddedRoom.code:
          setSingleUserChatRoom(message.payload);
          sendMessage(user_url.ws.chat.getRoomData, { roomId: message.payload.roomId });
          return HandlerResult.Handled;
        
        default:
          return HandlerResult.NotHandled;
      }
    }));

    unsubs.push(subscribe(user_url.ws.chat.sendDirectMessage, (message, schema) => {
      switch (message.code) {
        case schema.output.MessageSent.code:
          sendMessage(user_url.ws.chat.getRoomData, { roomId: message.payload.roomId });
          return HandlerResult.Handled;
        
        default:
          return HandlerResult.NotHandled;
      }
    }));

    unsubs.push(subscribe(user_url.ws.chat.leaveRoom, (message, schema) => {
      switch (message.code) {
        case schema.output.RoomLeft.code:
          leaveRoom(message.payload.roomId);
          return HandlerResult.Handled;

        default:
          return HandlerResult.NotHandled;
      }
    }));

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [subscribe, sendMessage]);

  const handleSelectRoom = useCallback(
    (roomId: number) => {
      console.log("handleSelectRoom called with roomId:", roomId);
      console.log("Current rooms:", userChatRooms);
      const room = userChatRooms.get(roomId);
      if (room === undefined) return;

      userChatRoomsUIData.get(roomId)!.lastVisitTimestamp = Date.now();
      userChatRoomsUIData.get(roomId)!.unreadMessageCount = 0;

      console.log("Selecting room:", roomId, room);
      sendMessage(user_url.ws.chat.getRoomData, { roomId });
    },
    [userChatRooms, userChatRoomsUIData, sendMessage],
  )

  /* -------------------- Payload Handlers -------------------- */

  const handleFetchUserConnectionsPayload = (payload: any) => {
    console.log("Setting user connections:", payload)
    const connections = payload || []
    
    // Update userMap
    const connectionUserMap: Record<number, string> = {}
    const onlineStatusMap = new Map<number, number>()

    connections.forEach((conn: any) => {
      if (conn && typeof conn.id === 'number') {
        if (typeof conn.username === 'string') {
          connectionUserMap[conn.id] = conn.username
        }
        if (typeof conn.onlineStatus === 'number') {
          onlineStatusMap.set(conn.id, conn.onlineStatus)
          // Update persistent ref
          if (conn.onlineStatus === 1) {
            onlineUsersRef.current.add(conn.id)
          } else {
            onlineUsersRef.current.delete(conn.id)
          }
        }
      }
    })
    setUserMap((prev) => ({ ...prev, ...connectionUserMap }))
    
    // Update online status for current room users if we have info
    if (onlineStatusMap.size > 0) {
      setCurrentRoomUsers((prev) => 
        prev.map((u) => {
          if (onlineStatusMap.has(u.id)) {
            return { ...u, onlineStatus: onlineStatusMap.get(u.id)! }
          }
          // Fallback to what we know in ref if not in map (edge case)
          if (onlineUsersRef.current.has(u.id)) {
            return { ...u, onlineStatus: 1 }
          }
          return u
        })
      )
    }
    
    // Update pending requests
    const pending = connections
      .filter((conn: any) => conn.status === 1 && conn.friendId === selfUserId) // Only show requests where we're the target
      .map((conn: any) => ({
        userId: conn.id,
        username: conn.username,
        alias: conn.alias,
      }))
    setPendingFriendshipRequests(pending)
    
    // Update blocked users
    const blocked = connections
      .filter((conn: any) => conn.status === 3)
      .map((conn: any) => conn.friendId)
    setBlockedUserIds(blocked)
  }

  const handleReceiveMessagePayload = (messagePayload: TypeStoredMessageSchema) => {
    try {
      if (!messagePayload || !messagePayload.roomId) return

      if (!messagePayload.userId || typeof messagePayload.userId !== 'number') {
        console.error("Message skipped: invalid userId", messagePayload)
        return
      }

      const timestamp = messagePayload.messageDate < 32503680000
          ? new Date(messagePayload.messageDate * 1000).toISOString()
          : new Date(messagePayload.messageDate).toISOString()

      let resolvedUser = userMap[messagePayload.userId]
      if (!resolvedUser) {
        fetchUsername(messagePayload.userId)
        resolvedUser = `User ${messagePayload.userId}`
      }

      const transformedMessage = {
        user: resolvedUser,
        content: messagePayload.messageString,
        timestamp: timestamp,
        userId: messagePayload.userId,
      }

      const roomIdStr = String(messagePayload.roomId)
      setMessagesByRoom((prev) => ({
        ...prev,
        [roomIdStr]: [...(prev[roomIdStr] || []), transformedMessage],
      }))
    } catch (error) {
      console.error("Error processing message:", error)
    }
  }

  const handleListRoomsPayload = (receivedRooms: TypeRoomSchema[]) => {
    console.log("Setting rooms:", receivedRooms?.length)
    setRooms(receivedRooms)
    
    if (pendingDMTargetId != null && Array.isArray(receivedRooms)) {
      const dm = receivedRooms.find(r => {
        if (r.roomType !== 2 || typeof r.roomName !== 'string') return false
        if (!r.roomName.startsWith('DM ')) return false
        const parts = r.roomName.split(' ')
        if (parts.length !== 3) return false
        const a = Number(parts[1]); const b = Number(parts[2])
        if (Number.isNaN(a) || Number.isNaN(b)) return false
        const hasSelf = (a === selfUserId) || (b === selfUserId)
        const hasTarget = (a === pendingDMTargetId) || (b === pendingDMTargetId)
        return hasSelf && hasTarget
      })
      if (dm) {
        handleSelectRoom(dm.roomId)
        setPendingDMTargetId(null)
      }
    }

    if (Array.isArray(receivedRooms)) {
       receivedRooms.forEach((room, index) => {
         setTimeout(() => {
           sendMessage(user_url.ws.chat.getRoomData, { roomId: room.roomId })
         }, index * 50)
       })
    }
  }

  const handleJoinRoomPayload = (payload: any) => {
    try {
      if (payload.roomId) {
        const roomIdStr = String(payload.roomId)
        console.log("Successfully joined room:", roomIdStr)

        if (!messagesByRoom[roomIdStr]) {
          setMessagesByRoom((prev) => ({
            ...prev,
            [roomIdStr]: [],
          }))
        }

        if (Number(payload.roomId) === currentRoomId && typeof payload.user === 'number' && payload.user !== selfUserId) {
          sendMessage(user_url.ws.chat.getRoomData, { roomId: Number(payload.roomId) })
        }
      }
    } catch (error) {
      console.error("Error processing join room:", error)
    }
  }

  const handleAddRoomPayload = (payloadReceived: any) => {
    if (payloadReceived.code === 0) {
      sendMessage(user_url.ws.chat.listRooms, {})
    } else {
      const errorMsg = payloadReceived.payload?.message ||
        payloadReceived.payload?.error ||
        "Failed to create room."
      if (showToast) showToast(errorMsg, 'error')
    }
  }

  const handleLeaveRoomPayload = (payloadReceived: any) => {
    try {
      const payload = payloadReceived.payload as { user: number; roomId: number } | { message: string }

      if ('roomId' in payload && payloadReceived.code === 0) {
        const roomIdStr = String(payload.roomId)
        const leftRoomId = Number(payload.roomId)

        if (leftRoomId === currentRoomId && 'user' in payload && payload.user !== selfUserId) {
          sendMessage(user_url.ws.chat.getRoomData, { roomId: leftRoomId })
        }

        if ('user' in payload && payload.user === selfUserId) {
          setRooms(prev => prev.filter(r => r.roomId !== leftRoomId))
          setMessagesByRoom(prev => {
            const newState = { ...prev }
            delete newState[roomIdStr]
            return newState
          })
          sendMessage(user_url.ws.chat.listRooms, {})
          if (showToast) showToast("You have left the room.", 'success')
        }
      } else if (payloadReceived.code !== 0) {
        const errorMsg = 'message' in payload ? payload.message : "Failed to leave room."
        if (showToast) showToast(errorMsg, 'error')
      }
    } catch (error) {
      console.error("Error processing leave room:", error)
    }
  }

  const handleAddUserToRoomPayload = (payload: any) => {
    try {
      if (payload && typeof payload.user === 'number') {
        if (!userMap[payload.user]) fetchUsername(payload.user)
        if (payload.user === selfUserId && typeof payload.roomId === 'number') {
          sendMessage(user_url.ws.chat.getRoomData, { roomId: payload.roomId })
        }
      }
    } catch (e) {
      console.error('Error handling addUserToRoom event:', e)
    }
  }

  const handleGetRoomDataPayload = (roomData: any) => {
    try {
      const roomIdStr = String(roomData.room.roomId)

      // Build user map
      if (Array.isArray(roomData.users)) {
        const newMap: Record<number, string> = {}
        roomData.users.forEach((u: any) => {
          if (u && typeof u.id === 'number' && typeof u.username === 'string') {
            newMap[u.id] = u.username
          }
        })
        setUserMap((prev) => ({ ...prev, ...newMap }))

        if (Array.isArray(roomData.userConnections)) {
          const myConnection = roomData.userConnections.find((uc: any) => uc.userId === selfUserId)

          if (roomData.room.roomType === 2) {
            if (myConnection && myConnection.userState === ChatRoomUserAccessType.INVITED) {
              const otherConnection = roomData.userConnections.find((uc: any) => uc.userId !== selfUserId)
              const otherId = otherConnection?.userId || 0
              const otherUsername = newMap[otherId] || userMap[otherId] || `User ${otherId}`

              setPendingDmInvites(prev => {
                if (!prev.some(inv => inv.roomId === roomData.room.roomId)) {
                  return [...prev, { roomId: roomData.room.roomId, oderId: otherId, username: otherUsername }]
                }
                return prev
              })
            } else if (myConnection && myConnection.userState === ChatRoomUserAccessType.JOINED) {
              setPendingDmInvites(prev => prev.filter(inv => inv.roomId !== roomData.room.roomId))
            }
          } else {
            if (myConnection && myConnection.userState === ChatRoomUserAccessType.INVITED) {
              const inviterConnection = roomData.userConnections.find((uc: any) =>
                uc.userId !== selfUserId && uc.userState === ChatRoomUserAccessType.JOINED
              )
              const inviterId = inviterConnection?.userId || 0
              const inviterUsername = newMap[inviterId] || userMap[inviterId] || `User ${inviterId}`

              setPendingRoomInvites(prev => {
                if (!prev.some(inv => inv.roomId === roomData.room.roomId)) {
                  return [...prev, { roomId: roomData.room.roomId, roomName: roomData.room.roomName, inviterId, inviterUsername }]
                }
                return prev
              })
            } else if (myConnection && myConnection.userState === ChatRoomUserAccessType.JOINED) {
              setPendingRoomInvites(prev => prev.filter(inv => inv.roomId !== roomData.room.roomId))
            }
          }
        }

        if (Number(roomIdStr) === currentRoomId) {
          if (Array.isArray(roomData.userConnections)) {
            const joinedIds = new Set(
              roomData.userConnections
                .filter((uc: any) => uc && uc.userState === ChatRoomUserAccessType.JOINED)
                .map((uc: any) => uc.userId)
            )
            const joinedUsers = (roomData.users || []).filter((u: any) => joinedIds.has(u.id))
            // Apply known online status from ref
            setCurrentRoomUsers(joinedUsers.map((u: any) => ({
              ...u,
              onlineStatus: onlineUsersRef.current.has(u.id) ? 1 : 0
            })))
          } else {
            const allUsers = roomData.users || []
             // Apply known online status from ref
            setCurrentRoomUsers(allUsers.map((u: any) => ({
              ...u,
              onlineStatus: onlineUsersRef.current.has(u.id) ? 1 : 0
            })))
          }
        }
      }

      if (Array.isArray(roomData.messages)) {
        const roomMessages = roomData.messages
          .filter((msg: TypeStoredMessageSchema) => typeof msg.userId === 'number')
          .map((msg: TypeStoredMessageSchema) => ({
            user: (roomData.users && roomData.users.find((u: any) => u.id === msg.userId)?.username) || userMap[msg.userId] || `User ${msg.userId}`,
            content: msg.messageString,
            timestamp: new Date(msg.messageDate * 1000).toISOString(),
            userId: msg.userId,
          }))

        setMessagesByRoom((prev) => ({ ...prev, [roomIdStr]: roomMessages }))
      } else {
        setMessagesByRoom((prev) => ({ ...prev, [roomIdStr]: prev[roomIdStr] || [] }))
      }
    } catch (err) {
      console.error("Error processing getRoomData:", err)
    }
  }

  const handleSendDirectMessagePayload = (payloadReceived: any) => {
    if (payloadReceived.code === 0 && payloadReceived.payload) {
      const dmPayload = payloadReceived.payload as { roomId: number }
      
      sendMessage(user_url.ws.chat.listRooms, {})
      setTimeout(() => {
        sendMessage(user_url.ws.chat.getRoomData, { roomId: Number(dmPayload.roomId) })
      }, 100)
      setTimeout(() => {
        setCurrentRoomId(dmPayload.roomId as number)
      }, 200)
    } else {
      const errorMsg = payloadReceived.payload?.message || payloadReceived.payload?.error || `Failed to send DM (code: ${payloadReceived.code})`
      if (showToast) showToast(errorMsg, 'error')
    }
  }

  const handleUserConnectedPayload = (payload: any) => {
    console.log("User connected payload:", payload)
    if (payload && typeof payload.userId === 'number') {
      const userId = payload.userId
      onlineUsersRef.current.add(userId) // Update ref
      fetchUsername(userId)
      setCurrentRoomUsers((prev) => prev.map((u) => u.id === userId ? { ...u, onlineStatus: 1 } : u))
    }
  }

  const handleUserDisconnectedPayload = (payload: any) => {
    console.log("User disconnected payload:", payload)
    if (payload && typeof payload.userId === 'number') {
       const userId = payload.userId
       onlineUsersRef.current.delete(userId) // Update ref
       setCurrentRoomUsers((prev) => prev.map((u) => u.id === userId ? { ...u, onlineStatus: 0 } : u))
    }
  }

  const handleUserProfileDataPayload = (payloadReceived: any) => {
    if (payloadReceived.code === 0 && payloadReceived.payload) {
      const profile = payloadReceived.payload
      if (profile.id && profile.username) {
        setUserMap((prev) => ({ ...prev, [profile.id]: profile.username }))
        if (pendingProfileLookup === profile.username) {
          setProfileUserId(profile.id)
          setShowProfileModal(true)
          setPendingProfileLookup(null)
        }
      }
    } else if (pendingProfileLookup) {
      if (showToast) showToast(`Cannot open profile for ${pendingProfileLookup} - user not found`, 'error')
      setPendingProfileLookup(null)
    }
  }

  /* -------------------- Handle Incoming Messages -------------------- */
  // useEffect(() => {
  //   if (!payloadReceived) return

  //   if (!payloadReceived.funcId?.includes('game_state') && !payloadReceived.source_container?.includes('pong')) {
  //     console.log("[Chat] Received:", payloadReceived.funcId)
  //   }

  //   switch (payloadReceived.funcId) {
  //     case user_url.ws.users.fetchUserConnections.funcId:
  //       handleFetchUserConnectionsPayload(payloadReceived.payload)
  //       break

  //     case user_url.ws.users.blockUser.funcId:
  //     case user_url.ws.users.unblockUser.funcId:
  //       console.log("Block/unblock response, refreshing connections")
  //       if (payloadReceived.code === 0) {
  //         sendMessage(user_url.ws.users.fetchUserConnections, null)
  //       }
  //       break

  //     case user_url.ws.chat.sendMessage.funcId:
  //       handleReceiveMessagePayload(payloadReceived.payload as TypeStoredMessageSchema)
  //       break

  //     case user_url.ws.chat.listRooms.funcId:
  //       handleListRoomsPayload(payloadReceived.payload as TypeRoomSchema[])
  //       break

  //     case user_url.ws.chat.joinRoom.funcId:
  //       handleJoinRoomPayload(payloadReceived.payload)
  //       break

  //     case user_url.ws.chat.addRoom.funcId:
  //       handleAddRoomPayload(payloadReceived)
  //       break

  //     case user_url.ws.chat.leaveRoom.funcId:
  //       handleLeaveRoomPayload(payloadReceived)
  //       break

  //     case user_url.ws.chat.addUserToRoom.funcId:
  //       handleAddUserToRoomPayload(payloadReceived.payload)
  //       break

  //     case user_url.ws.chat.getRoomData.funcId:
  //       handleGetRoomDataPayload(payloadReceived.payload)
  //       break

  //     case user_url.ws.users.confirmFriendship.funcId:
  //       if (payloadReceived.code === 0) sendMessage(user_url.ws.users.fetchUserConnections, null)
  //       break

  //     case user_url.ws.users.denyFriendship.funcId:
  //       if (payloadReceived.code === 0) sendMessage(user_url.ws.users.fetchUserConnections, null)
  //       break

  //     case user_url.ws.chat.sendDirectMessage.funcId:
  //       handleSendDirectMessagePayload(payloadReceived)
  //       break

  //     case user_url.ws.users.userOnlineStatusUpdate.funcId:
  //       if (payloadReceived.code === user_url.ws.users.userOnlineStatusUpdate.schema.output.GetOnlineUsers.code) {
  //         for (const id of payloadReceived.payload) {
  //           handleUserConnectedPayload({ userId: parseInt(id, 10) })
  //         }
  //       }
  //       else if (payloadReceived.code === user_url.ws.users.userOnlineStatusUpdate.schema.output.GetOfflineUsers.code) {
  //         for (const id of payloadReceived.payload) {
  //           handleUserDisconnectedPayload({ userId: parseInt(id, 10) })
  //         }
  //       }
  //       break

  //     case user_url.ws.users.requestUserProfileData.funcId:
  //       handleUserProfileDataPayload(payloadReceived)
  //       break

  //     default:
  //       // Only log unhandled messages that aren't from pong (to reduce spam)
  //       if (payloadReceived.source_container !== 'pong') {
  //         console.log("Unhandled funcId:", payloadReceived.funcId)
  //       }
  //   }
  // }, [payloadReceived])
  // Note: userMap removed from dependencies to prevent infinite loop
  // userMap is only read inside the effect, not used as a trigger

  useEffect(() => {
    // console.log("Requesting room list and user connections on mount")
    sendMessage(user_url.ws.chat.listRooms, {})
    sendMessage(user_url.ws.users.fetchUserConnections, null)
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
            sendMessage(user_url.ws.chat.sendMessage, {
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
                sendMessage(user_url.ws.chat.addUserToRoom, {
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
                  sendMessage(user_url.ws.chat.addUserToRoom, {
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
                          sendMessage(user_url.ws.chat.addUserToRoom, {
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
                  sendMessage(user_url.ws.users.requestUserProfileData, usernameOrId)

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
      sendMessage(user_url.ws.chat.sendMessage, {
        roomId: currentRoomId,
        messageString: content,
      })
    },
    [currentRoomId],
  )

  // Explicit join handler - called when the user clicks the Join button
  const handleJoinSelectedRoom = useCallback((roomId: number) => {
    console.log("Joining selected room:", roomId)
    sendMessage(user_url.ws.chat.joinRoom, { roomId })
    // Refresh room data and list after joining
    setTimeout(() => {
      sendMessage(user_url.ws.chat.getRoomData, { roomId })
      sendMessage(user_url.ws.chat.listRooms, {})
    }, 250)
  }, [])

  const handleLeaveRoom = useCallback(
    (roomId: number) => {
      console.log("Leaving room:", roomId)
      sendMessage(user_url.ws.chat.leaveRoom, { roomId })
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
      sendMessage(user_url.ws.chat.addRoom, { roomName })
    },
    [],
  )

  const handleRefreshRooms = useCallback(() => {
    console.log("Refreshing rooms")
    sendMessage(user_url.ws.chat.listRooms, {})
  }, [])

  // Ensure the displayed room name updates when the rooms list changes
  useEffect(() => {
    if (currentRoomId != null) {
      try {
        const room = rooms.find(r => r.roomId === currentRoomId)
        console.log(`[rooms effect] currentRoomId=${currentRoomId} rooms.length=${rooms.length} found=`, !!room)
        if (room) {
          console.log(`[rooms effect] setting currentRoomName from rooms: ${room.roomName}`)
          setCurrentRoomName(computeRoomDisplayName(room))
          setCurrentRoomType(room.roomType ?? null)
        }
      } catch (e) { /* ignore */ }
    }
  }, [rooms, currentRoomId, computeRoomDisplayName])

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
      sendMessage(user_url.ws.users.confirmFriendship, userId)
      // Refresh connections after accepting
      setTimeout(() => {
        sendMessage(user_url.ws.users.fetchUserConnections, null)
      }, 500)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [],
  )

  const handleDenyFriendship = useCallback(
    (userId: number) => {
      console.log("Denying friendship request from:", userId)
      sendMessage(user_url.ws.users.denyFriendship, userId)
      // Refresh connections after denying
      setTimeout(() => {
        sendMessage(user_url.ws.users.fetchUserConnections, null)
      }, 500)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [],
  )

  // Handler for accepting a room invite (join the room)
  const handleAcceptRoomInvite = useCallback(
    (roomId: number, roomName?: string) => {
      console.log("Accepting room invite, joining room:", roomId, roomName)
      sendMessage(user_url.ws.chat.joinRoom, { roomId })
      // Remove from pending invites
      setPendingRoomInvites(prev => prev.filter(inv => inv.roomId !== roomId))
      // Select the room and open it
      setCurrentRoomId(roomId)
      // If the invite provided a roomName, set a provisional display name immediately
      try {
        if (roomName) {
          console.log(`[handleAcceptRoomInvite] setting provisional name from invite: ${roomName}`)
          setCurrentRoomName(roomName)
          setCurrentRoomType(null)
        }
      } catch (e) { /* ignore */ }
      // Try to set a display name immediately if we already know the room
      try {
        const room = rooms.find(r => r.roomId === roomId)
        console.log(`[handleAcceptRoomInvite] lookup roomId=${roomId} found=`, !!room)
        if (room) {
          console.log(`[handleAcceptRoomInvite] setting name from rooms list: ${room.roomName}`)
          setCurrentRoomName(computeRoomDisplayName(room))
          setCurrentRoomType(room.roomType ?? null)
        }
      } catch (e) { /* ignore */ }
      // Refresh rooms list and get room data
      setTimeout(() => {
        sendMessage(user_url.ws.chat.listRooms, {})
        sendMessage(user_url.ws.chat.getRoomData, { roomId })
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
      sendMessage(user_url.ws.chat.joinRoom, { roomId })
      // Remove from pending DM invites
      setPendingDmInvites(prev => prev.filter(inv => inv.roomId !== roomId))
      // Select the room
      setCurrentRoomId(roomId)
      // Refresh room data
      setTimeout(() => {
        sendMessage(user_url.ws.chat.getRoomData, { roomId })
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
      sendMessage(user_url.ws.users.unblockUser, userId)
    } else {
      // Block - call server API
      console.log("Blocking user:", userId)
      sendMessage(user_url.ws.users.blockUser, userId)
    }
    // Optimistically update local state
    setBlockedUserIds((prev) =>
      isCurrentlyBlocked ? prev.filter((id) => id !== userId) : [...prev, userId]
    )
  }, [blockedUserIds])

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
    sendMessage(user_url.ws.users.requestUserProfileData, username)
  }, [])

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
      sendMessage(user_url.ws.chat.sendDirectMessage, {
        targetUserId,
        messageString: "Started a conversation",
      })
      // Remember we want to switch to this DM when rooms arrive
      setPendingDMTargetId(targetUserId)
      // Nudge a rooms refresh to get the DM in the list quickly
      setTimeout(() => {
        sendMessage(user_url.ws.chat.listRooms, {})
      }, 100)
    },
    [sendMessage],
  )

  /* -------------------- Render -------------------- */
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-6xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <RoomList />
          </div>

          <div className="md:col-span-2">
            <ChatBox
              isJoined={rooms.some(r => r.roomId === currentRoomId)}
              onJoinRoom={handleJoinSelectedRoom}
              onInvitePong={handleInvitePong}
              onBlockUser={handleBlockUser}
              blockedUserIds={blockedUserIds}
              onOpenProfile={handleOpenProfile}
              roomUsers={currentRoomUsers}
              selfUserId={selfUserId}
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