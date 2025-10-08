"use client"

import { useState, useEffect, useRef } from "react"

interface User {
  id: string
  username: string
  lastSeen?: Date
  isOnline?: boolean
}

interface PresenceState {
  onlineUsers: User[]
  typingUsers: { [userId: string]: { username: string; timestamp: Date } }
  userActivity: { [userId: string]: Date }
}

export function usePresence(currentUser: User, sendMessage: (data: any) => void, isConnected: boolean) {
  const [presenceState, setPresenceState] = useState<PresenceState>({
    onlineUsers: [],
    typingUsers: {},
    userActivity: {},
  })

  const heartbeatIntervalRef = useRef<NodeJS.Timeout>()
  const typingTimeoutRef = useRef<NodeJS.Timeout>()
  const activityTimeoutRef = useRef<NodeJS.Timeout>()

  // Send heartbeat to maintain presence
  useEffect(() => {
    if (!isConnected) return

    const sendHeartbeat = () => {
      sendMessage({
        container: "presence",
        endpoint: "/api/presence/heartbeat",
        user_id: currentUser.id,
        username: currentUser.username,
        timestamp: new Date().toISOString(),
      })
    }

    // Send initial heartbeat
    sendHeartbeat()

    // Send heartbeat every 30 seconds
    heartbeatIntervalRef.current = setInterval(sendHeartbeat, 30000)

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
      }
    }
  }, [isConnected, currentUser, sendMessage])

  // Clean up typing indicators
  useEffect(() => {
    const cleanupTyping = () => {
      const now = new Date()
      setPresenceState((prev) => ({
        ...prev,
        typingUsers: Object.fromEntries(
          Object.entries(prev.typingUsers).filter(([_, data]) => now.getTime() - data.timestamp.getTime() < 5000),
        ),
      }))
    }

    const interval = setInterval(cleanupTyping, 1000)
    return () => clearInterval(interval)
  }, [])

  const updateUserPresence = (users: User[]) => {
    setPresenceState((prev) => ({
      ...prev,
      onlineUsers: users.map((user) => ({
        ...user,
        isOnline: true,
        lastSeen: new Date(),
      })),
    }))
  }

  const addTypingUser = (userId: string, username: string) => {
    if (userId === currentUser.id) return

    setPresenceState((prev) => ({
      ...prev,
      typingUsers: {
        ...prev.typingUsers,
        [userId]: {
          username,
          timestamp: new Date(),
        },
      },
    }))
  }

  const removeTypingUser = (userId: string) => {
    setPresenceState((prev) => ({
      ...prev,
      typingUsers: Object.fromEntries(Object.entries(prev.typingUsers).filter(([id]) => id !== userId)),
    }))
  }

  const updateUserActivity = (userId: string) => {
    setPresenceState((prev) => ({
      ...prev,
      userActivity: {
        ...prev.userActivity,
        [userId]: new Date(),
      },
    }))
  }

  const sendTypingIndicator = (roomName: string) => {
    if (!isConnected) return

    sendMessage({
      container: "presence",
      endpoint: "/api/presence/typing",
      user_id: currentUser.id,
      username: currentUser.username,
      room_name: roomName,
      timestamp: new Date().toISOString(),
    })

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Stop typing after 3 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      sendMessage({
        container: "presence",
        endpoint: "/api/presence/stop_typing",
        user_id: currentUser.id,
        room_name: roomName,
      })
    }, 3000)
  }

  const getTypingUsers = (): string[] => {
    return Object.values(presenceState.typingUsers).map((data) => data.username)
  }

  const getUserLastSeen = (userId: string): Date | null => {
    const user = presenceState.onlineUsers.find((u) => u.id === userId)
    return user?.lastSeen || presenceState.userActivity[userId] || null
  }

  const isUserOnline = (userId: string): boolean => {
    return presenceState.onlineUsers.some((u) => u.id === userId)
  }

  return {
    onlineUsers: presenceState.onlineUsers,
    typingUsers: getTypingUsers(),
    updateUserPresence,
    addTypingUser,
    removeTypingUser,
    updateUserActivity,
    sendTypingIndicator,
    getUserLastSeen,
    isUserOnline,
  }
}
