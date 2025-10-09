"use client"

import { useCallback, useMemo } from "react"
import { useLocalStorage, useSessionStorage } from "./use-storage"

interface Message {
  id: number
  text: string
  sender: string
  timestamp: Date
  room: string
  isSystem?: boolean
}

interface ChatState {
  rooms: string[]
  currentRoom: string
  messageHistory: { [roomName: string]: Message[] }
  userPreferences: {
    theme: "light" | "dark" | "system"
    notifications: boolean
    soundEnabled: boolean
  }
}

const defaultChatState: ChatState = {
  rooms: [], // Start with no rooms - they'll be created as needed
  currentRoom: "", // No default room
  messageHistory: {},
  userPreferences: {
    theme: "system",
    notifications: true,
    soundEnabled: true,
  },
}

export function useChatPersistence(userId: string) {
  // Use localStorage for persistent data across sessions
  const [persistentState, setPersistentState] = useLocalStorage<ChatState>(`chatroom-state-${userId}`, defaultChatState)

  // Use sessionStorage for temporary data within session
  const [sessionState, setSessionState] = useSessionStorage<{
    lastActiveRoom: string
    unreadCounts: { [roomName: string]: number }
  }>(`chatroom-session-${userId}`, {
    lastActiveRoom: persistentState.currentRoom,
    unreadCounts: {},
  })

  const updateRooms = useCallback(
    (rooms: string[]) => {
      setPersistentState((prev) => ({
        ...prev,
        rooms: [...new Set(rooms)], // Remove duplicates
      }))
    },
    [setPersistentState],
  )

  const setCurrentRoom = useCallback(
    (roomName: string) => {
      setPersistentState((prev) => ({
        ...prev,
        currentRoom: roomName,
      }))
      setSessionState((prev) => ({
        ...prev,
        lastActiveRoom: roomName,
        unreadCounts: {
          ...prev.unreadCounts,
          [roomName]: 0, // Reset unread count for current room
        },
      }))
    },
    [setPersistentState, setSessionState],
  )

  const addMessage = useCallback(
    (message: Message) => {
      setPersistentState((prev) => {
        const roomMessages = prev.messageHistory[message.room] || []
        const updatedMessages = [...roomMessages, message]

        // Keep only last 100 messages per room to prevent storage bloat
        const trimmedMessages = updatedMessages.slice(-100)

        return {
          ...prev,
          messageHistory: {
            ...prev.messageHistory,
            [message.room]: trimmedMessages,
          },
        }
      })

      setSessionState((prev) => {
        setPersistentState((persistentPrev) => {
          // Update unread count if message is not in current room
          if (message.room !== persistentPrev.currentRoom && !message.isSystem) {
            setSessionState((sessionPrev) => ({
              ...sessionPrev,
              unreadCounts: {
                ...sessionPrev.unreadCounts,
                [message.room]: (sessionPrev.unreadCounts[message.room] || 0) + 1,
              },
            }))
          }
          return persistentPrev // Don't change persistent state here
        })
        return prev // Don't change session state here
      })
    },
    [setPersistentState, setSessionState],
  )

  const clearRoomMessages = useCallback(
    (roomName: string) => {
      setPersistentState((prev) => ({
        ...prev,
        messageHistory: {
          ...prev.messageHistory,
          [roomName]: [],
        },
      }))
    },
    [setPersistentState],
  )

  const updateUserPreferences = useCallback(
    (preferences: Partial<ChatState["userPreferences"]>) => {
      setPersistentState((prev) => ({
        ...prev,
        userPreferences: {
          ...prev.userPreferences,
          ...preferences,
        },
      }))
    },
    [setPersistentState],
  )

  const getRoomMessages = useCallback(
    (roomName: string): Message[] => {
      const messages = persistentState.messageHistory[roomName] || []
      return messages.map((message) => ({
        ...message,
        timestamp: message.timestamp instanceof Date ? message.timestamp : new Date(message.timestamp),
      }))
    },
    [persistentState.messageHistory],
  )

  const getUnreadCount = useCallback(
    (roomName: string): number => {
      return sessionState.unreadCounts[roomName] || 0
    },
    [sessionState.unreadCounts],
  )

  const getTotalUnreadCount = useMemo((): number => {
    return Object.values(sessionState.unreadCounts).reduce((sum, count) => sum + count, 0)
  }, [sessionState.unreadCounts])

  const exportChatData = useCallback(() => {
    return {
      ...persistentState,
      exportedAt: new Date().toISOString(),
      userId,
    }
  }, [persistentState, userId])

  const importChatData = useCallback(
    (data: any) => {
      if (data.userId === userId) {
        setPersistentState({
          rooms: data.rooms || defaultChatState.rooms,
          currentRoom: data.currentRoom || defaultChatState.currentRoom,
          messageHistory: data.messageHistory || {},
          userPreferences: {
            ...defaultChatState.userPreferences,
            ...data.userPreferences,
          },
        })
      }
    },
    [userId, setPersistentState],
  )

  return {
    // State
    rooms: persistentState.rooms,
    currentRoom: persistentState.currentRoom,
    userPreferences: persistentState.userPreferences,
    lastActiveRoom: sessionState.lastActiveRoom,

    // Actions
    updateRooms,
    setCurrentRoom,
    addMessage,
    clearRoomMessages,
    updateUserPreferences,

    // Getters
    getRoomMessages,
    getUnreadCount,
    getTotalUnreadCount,

    // Import/Export
    exportChatData,
    importChatData,
  }
}
