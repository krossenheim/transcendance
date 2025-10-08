"use client"


import type React from "react"

import { SendMessageSchema } from "@/lib/chat-schemas"
import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useWebSocket } from "@/hooks/use-websocket"
import { useToast } from "@/hooks/use-toast"
import { useChatPersistence } from "@/hooks/use-chat-persistence"
import { MessageList } from "@/components/message-list"
import { UserList } from "@/components/user-list"
import { RoomManager } from "@/components/room-manager"
import { ConnectionStatus } from "@/components/connection-status"
import { Trash2 } from "lucide-react"

interface User {
  id: string
  username: string
}

interface ChatRoomProps {
  user: User
}

export function ChatRoom({ user }: ChatRoomProps) {
  const {
    rooms,
    currentRoom,
    updateRooms,
    setCurrentRoom,
    addMessage,
    getRoomMessages,
    getUnreadCount,
    userPreferences,
    clearRoomMessages,
  } = useChatPersistence(user.id)

  const [message, setMessage] = useState("")
  const [messages, setMessages] = useState(() => getRoomMessages(currentRoom))
  const [onlineUsers, setOnlineUsers] = useState<any[]>([])
  const [connectedUserIds, setConnectedUserIds] = useState<Set<number>>(new Set())
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [needsDefaultRoom, setNeedsDefaultRoom] = useState(rooms.length === 0)
  const [wsUserId, setWsUserId] = useState<number | null>(null)

  const wsUserIdRef = useRef<number | null>(null)

  const typingTimeoutRef = useRef<NodeJS.Timeout>()
  const { toast } = useToast()

  useEffect(() => {
    wsUserIdRef.current = wsUserId
  }, [wsUserId])

  const handleWebSocketMessage = useCallback(
    (data: any) => {
      // Ignore pong/game messages
      if (data.source_container && data.source_container !== "chat") {
        return
      }

      console.log("[v0] Received WebSocket message:", data)

      if (!data || typeof data !== "object") {
        console.warn("[v0] Invalid message data received:", data)
        return
      }

      if (data.user_id && typeof data.user_id === "number") {
        console.log("[v0] Setting WebSocket user ID:", data.user_id)
        setWsUserId(data.user_id)

        setConnectedUserIds((prev) => {
          const newSet = new Set(prev)
          newSet.add(data.user_id)

          const userList = Array.from(newSet).map((id) => ({
            id: id.toString(),
            username: id === data.user_id ? user.username : `User ${id}`,
          }))

          setOnlineUsers(userList)

          return newSet
        })

        toast({
          title: "User Connected",
          description: `User ID ${data.user_id} joined the chat`,
        })
        return
      }

      if (data.func_name === "chatRoomUserCount" || (data.room_name && data.user_count !== undefined)) {
        console.log("[v0] Room user count update:", data)
        // Update user count for specific room
        if (data.room_name === currentRoom) {
          // Create fake user list based on count for now
          const userList = Array.from({ length: data.user_count || 0 }, (_, i) => ({
            id: (i + 1).toString(),
            username: i === 0 ? user.username : `User ${i + 1}`,
          }))
          setOnlineUsers(userList)
        }
        return
      }

      if (data.func_name === "userJoinedRoom" || (data.user_id && data.room_name && data.action === "joined")) {
        console.log("[v0] User joined room:", data)
        if (data.room_name === currentRoom) {
          setConnectedUserIds((prev) => {
            const newSet = new Set(prev)
            newSet.add(data.user_id)

            const userList = Array.from(newSet).map((id) => ({
              id: id.toString(),
              username: id === data.user_id ? user.username : `User ${id}`,
            }))

            setOnlineUsers(userList)
            return newSet
          })
        }
        return
      }

      if (data.room_list && Array.isArray(data.room_list)) {
        console.log("[v0] Processing room list:", data.room_list)
        if (data.room_list.length > 0) {
          const newRooms = data.room_list.filter((room: string) => !rooms.includes(room))
          if (newRooms.length > 0) {
            updateRooms([...rooms, ...newRooms])
            if (!currentRoom && newRooms.length > 0) {
              setCurrentRoom(newRooms[0])

              const currentWsUserId = wsUserIdRef.current
              console.log("[v0] Auto-joining first room. Current wsUserId:", currentWsUserId)
              if (sendWsMessage && currentWsUserId) {
                console.log("[v0] Sending add_to_room request for first room:", {
                  endpoint: "/api/chat/add_to_room",
                  room_name: newRooms[0],
                  user_to_add: currentWsUserId,
                })
                sendWsMessage({
                  endpoint: "/api/chat/add_to_room",
                  room_name: newRooms[0],
                  user_to_add: currentWsUserId,
                })
              }
            }
            toast({
              title: "Rooms Loaded",
              description: `Found ${data.room_list.length} existing rooms`,
            })
          }
        } else {
          console.log("[v0] No existing rooms found")
          toast({
            title: "No Rooms",
            description: "No existing rooms found. Create one to get started!",
          })
        }
        return
      }

      switch (data.func_name) {
        case "chatAddMessageToRoom":
          console.log("[CHAT] Received chat message:", data)
          if (data.room_name && data.message) {
            const newMessage = {
              id: Date.now(),
              text: data.message,
              sender: data.sender || "Unknown",
              timestamp: new Date(),
              room: data.room_name,
            }

            addMessage(newMessage)

            if (data.room_name === currentRoom) {
              setMessages((prev) => [...prev, newMessage])
            }
          }
          break
        case "chatRoomAdded":
          if (data.room_name && !rooms.includes(data.room_name)) {
            updateRooms([...rooms, data.room_name])
            if (!currentRoom) {
              setCurrentRoom(data.room_name)
            }

            const currentWsUserId = wsUserIdRef.current
            console.log("[v0] Room added, attempting to join. Current wsUserId:", currentWsUserId)
            if (sendWsMessage && currentWsUserId) {
              console.log("[v0] Sending add_to_room request:", {
                endpoint: "/api/chat/add_to_room",
                room_name: data.room_name,
                user_to_add: currentWsUserId,
              })
              sendWsMessage({
                endpoint: "/api/chat/add_to_room",
                room_name: data.room_name,
                user_to_add: currentWsUserId,
              })
            } else {
              console.warn("[v0] Cannot join room - missing sendWsMessage or wsUserId:", {
                sendWsMessage: !!sendWsMessage,
                wsUserId: currentWsUserId,
              })
            }

            toast({
              title: "Room Created",
              description: `Room #${data.room_name} has been created`,
            })
          }
          break
        case "chatRoomList":
          if (data.rooms && Array.isArray(data.rooms)) {
            const newRooms = data.rooms.filter((room: string) => !rooms.includes(room))
            if (newRooms.length > 0) {
              updateRooms([...rooms, ...newRooms])
              if (!currentRoom && newRooms.length > 0) {
                setCurrentRoom(newRooms[0])

                const currentWsUserId = wsUserIdRef.current
                if (sendWsMessage && currentWsUserId) {
                  sendWsMessage({
                    endpoint: "/api/chat/add_to_room",
                    room_name: newRooms[0],
                    user_to_add: currentWsUserId,
                  })
                }
              }
              toast({
                title: "Rooms Loaded",
                description: `Found ${data.rooms.length} existing rooms`,
              })
            }
          }
          break
        case "generalPopUpText":
          if (data.pop_up_text) {
            let popUpText = data.pop_up_text
            if (typeof popUpText === "object") {
              popUpText = popUpText["(root)"] || JSON.stringify(popUpText)
            }

            const isRoomNotFound = popUpText.includes("doesn't exist") && data.status === 400
            const isRoomExists = popUpText.includes("already exists") && data.status === 208
            const isUserNotInRoom =
              popUpText.includes("user_id") && popUpText.includes("isn't in it") && data.status === 400

            if (isUserNotInRoom) {
              // Extract room name from error message like "Room test doesn't exist or user_id testisnt in it."
              const roomNameMatch = popUpText.match(/Room (\w+) doesn't exist or user_id/)
              if (roomNameMatch) {
                const roomName = roomNameMatch[1]
                console.log("[v0] User not in room, attempting to join:", roomName)

                // Add room to our list if not already there
                if (!rooms.includes(roomName)) {
                  updateRooms([...rooms, roomName])
                }

                const currentWsUserId = wsUserIdRef.current
                if (sendWsMessage && currentWsUserId) {
                  console.log("[v0] Sending add_to_room request for existing room:", {
                    endpoint: "/api/chat/add_to_room",
                    room_name: roomName,
                    user_to_add: currentWsUserId,
                  })
                  sendWsMessage({
                    endpoint: "/api/chat/add_to_room",
                    room_name: roomName,
                    user_to_add: currentWsUserId,
                  })

                  toast({
                    title: "Joining Room",
                    description: `Attempting to join room #${roomName}...`,
                    variant: "secondary",
                  })
                  return // Don't show error toast, we're handling it
                }
              }

              toast({
                title: "Room Access Required",
                description: "You need to be added to this room to send messages",
                variant: "destructive",
              })
            } else if (isRoomNotFound) {
              toast({
                title: "Room Not Found",
                description: popUpText,
                variant: "destructive",
              })
            } else if (isRoomExists) {
              const roomNameMatch = popUpText.match(/Room (\w+) already exists/)
              if (roomNameMatch) {
                const roomName = roomNameMatch[1]
                console.log("[v0] Room already exists, attempting to join:", roomName)

                if (!rooms.includes(roomName)) {
                  updateRooms([...rooms, roomName])
                }

                if (!currentRoom) {
                  setCurrentRoom(roomName)
                }

                const currentWsUserId = wsUserIdRef.current
                if (sendWsMessage && currentWsUserId) {
                  console.log("[v0] Joining existing room:", {
                    endpoint: "/api/chat/add_to_room",
                    room_name: roomName,
                    user_to_add: currentWsUserId,
                  })
                  sendWsMessage({
                    endpoint: "/api/chat/add_to_room",
                    room_name: roomName,
                    user_to_add: currentWsUserId,
                  })
                }
              }

              toast({
                title: "Joining Existing Room",
                description: "Room already exists, joining it now...",
                variant: "secondary",
              })
            } else {
              const systemMessage = {
                id: Date.now(),
                text: popUpText,
                sender: "System",
                timestamp: new Date(),
                room: currentRoom || "system",
                isSystem: true,
              }

              addMessage(systemMessage)
              if (currentRoom) {
                setMessages((prev) => [...prev, systemMessage])
              }

              toast({
                title: "System Message",
                description: popUpText,
              })
            }
          }
          break
        default:
          console.log("[v0] Unhandled message type:", data.func_name)
      }
    },
    [addMessage, currentRoom, rooms, updateRooms, toast, user.id, user.username, setCurrentRoom],
  )

  const handleConnect = useCallback(() => {
    console.log("[v0] Connected to chat server")

    toast({
      title: "Connected",
      description: "Successfully connected to chat server",
    })
  }, [toast])

  const handleDisconnect = useCallback(() => {
    console.log("[v0] Disconnected from chat server")
    toast({
      title: "Disconnected",
      description: "Lost connection to chat server",
      variant: "destructive",
    })
  }, [toast])

  const handleError = useCallback(
    (error: Event) => {
      console.error("[v0] WebSocket error:", error)
      toast({
        title: "Connection Error",
        description: "Unable to connect to chat server. Using offline mode.",
        variant: "destructive",
      })
    },
    [toast],
  )

  const {
    socket,
    connectionStatus,
    sendMessage: sendWsMessage,
    isConnected,
    isReconnecting,
    reconnectAttempts,
    connectionError,
    isOfflineMode,
    retry,
  } = useWebSocket({
    onMessage: handleWebSocketMessage,
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
    onError: handleError,
    maxReconnectAttempts: 3,
    reconnectInterval: 5000,
  })

  const createDefaultRoom = useCallback(() => {
    if (needsDefaultRoom && sendWsMessage) {
      const defaultRoomName = "lobby"
      sendWsMessage({
        endpoint: "/api/chat/add_a_new_room",
        room_name: defaultRoomName,
      })
      setNeedsDefaultRoom(false)
    }
  }, [needsDefaultRoom, sendWsMessage])

  const handleSendMessage = useCallback(() => {
    console.log("handleSendMessage called", { message, currentRoom });
    if (!message.trim()) return

    // Zod validation
    const validation = SendMessageSchema.safeParse({
      message: message.trim(),
      room_name: currentRoom,
    })
    if (!validation.success) {
      toast({
        title: "Invalid Message",
        description: validation.error.errors.map(e => e.message).join(", "),
        variant: "destructive",
      })
      return
    }

    if (!isConnected) {
      const demoMessage = {
        id: Date.now(),
        text: message.trim(),
        sender: user.username,
        timestamp: new Date(),
        room: currentRoom,
      }

      addMessage(demoMessage)
      setMessages((prev) => [...prev, demoMessage])
      setMessage("")

      toast({
        title: "Offline Mode",
        description: "Message sent in offline mode (demo only)",
        variant: "secondary",
      })
      return
    }

    const messageData = {
      endpoint: "/api/chat/send_message_to_room",
      message: message.trim(),
      room_name: currentRoom,
    }

    sendWsMessage(messageData)
    setMessage("")

    clearTimeout(typingTimeoutRef.current)
  }, [message, isConnected, user, currentRoom, addMessage, toast, sendWsMessage])

  const handleTyping = useCallback((value: string) => {
    setMessage(value)
  }, [])

  const handleRoomChange = useCallback(
    (newRoom: string) => {
      setCurrentRoom(newRoom)
      setMessages(getRoomMessages(newRoom))

      const currentWsUserId = wsUserIdRef.current
      console.log("[v0] Room changed, attempting to join. Current wsUserId:", currentWsUserId)
      if (isConnected && sendWsMessage && currentWsUserId) {
        console.log("[v0] Sending add_to_room request for room change:", {
          endpoint: "/api/chat/add_to_room",
          room_name: newRoom,
          user_to_add: currentWsUserId,
        })
        sendWsMessage({
          endpoint: "/api/chat/add_to_room",
          room_name: newRoom,
          user_to_add: currentWsUserId,
        })
      } else {
        console.warn("[v0] Cannot join room on change - missing connection or wsUserId:", {
          isConnected,
          sendWsMessage: !!sendWsMessage,
          wsUserId: currentWsUserId,
        })
      }

      toast({
        title: "Room Changed",
        description: `Switched to #${newRoom}`,
      })
    },
    [setCurrentRoom, getRoomMessages, toast, isConnected, sendWsMessage],
  )

  const handleClearChat = useCallback(() => {
    clearRoomMessages(currentRoom)
    setMessages([])

    toast({
      title: "Chat Cleared",
      description: `All messages in #${currentRoom} have been cleared`,
    })
  }, [clearRoomMessages, currentRoom, toast])

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSendMessage()
      }
    },
    [handleSendMessage],
  )

  useEffect(() => {
    if (isConnected && needsDefaultRoom) {
      createDefaultRoom()
    }
  }, [isConnected, needsDefaultRoom, createDefaultRoom])

  useEffect(() => {
    setMessages(getRoomMessages(currentRoom))
  }, [currentRoom, getRoomMessages])

  useEffect(() => {
    if (socket && isConnected) {
      socket.send(
        JSON.stringify({
          endpoint: "/api/chat/list_rooms",
        }),
      )
    }
  }, [socket, isConnected])

  console.log("Current messages state:", messages)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-[calc(100vh-8rem)]">
      <div className="lg:col-span-1">
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="text-lg">Rooms</CardTitle>
            <ConnectionStatus
              isConnected={isConnected}
              isReconnecting={isReconnecting}
              reconnectAttempts={reconnectAttempts}
              connectionError={connectionError}
              onRetry={retry}
            />
            {(isOfflineMode || (!isConnected && !isReconnecting)) && (
              <Badge variant="secondary" className="w-fit">
                {isOfflineMode ? "Demo Mode" : "Offline Mode"}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {rooms.length > 0 ? (
              <Select value={currentRoom || undefined} onValueChange={handleRoomChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a room" />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map((room) => {
                    const unreadCount = getUnreadCount(room)
                    return (
                      <SelectItem key={room} value={room}>
                        <div className="flex items-center justify-between w-full">
                          <span>#{room}</span>
                          {unreadCount > 0 && (
                            <Badge variant="destructive" className="ml-2 text-xs">
                              {unreadCount}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            ) : (
              <div className="text-center text-sm text-muted-foreground p-4 border border-dashed rounded-lg">
                {isConnected ? "No rooms yet. Create one below!" : "Connect to see rooms"}
              </div>
            )}

            <RoomManager
              onRoomCreated={(roomName) => {
                if (!rooms.includes(roomName)) {
                  updateRooms([...rooms, roomName])
                  setCurrentRoom(roomName)
                }
              }}
              currentRoom={currentRoom}
              sendMessage={sendWsMessage}
              isConnected={isConnected}
            />

            <Separator />

            <UserList
              users={onlineUsers}
              currentUser={user}
              getUserLastSeen={() => new Date()}
              isUserOnline={() => false}
            />
          </CardContent>
        </Card>
      </div>

      <div className="lg:col-span-3">
        <Card className="h-full flex flex-col">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>{currentRoom ? `#${currentRoom}` : "No Room Selected"}</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{onlineUsers.length} online</Badge>
                {messages.length > 0 && <Badge variant="outline">{messages.length} messages</Badge>}
                <Badge variant={isConnected ? "default" : "secondary"}>{connectionStatus}</Badge>
                {messages.length > 0 && currentRoom && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearChat}
                    className="text-destructive hover:text-destructive bg-transparent"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
            {typingUsers.length > 0 && (
              <div className="text-sm text-muted-foreground animate-pulse">
                {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
              </div>
            )}
          </CardHeader>

          <CardContent className="flex-1 flex flex-col gap-4">
            {currentRoom ? (
              <>
                <MessageList messages={messages} currentUser={user} />

                <div className="flex gap-2">
                  <Input
                    value={message}
                    onChange={(e) => handleTyping(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder={
                      isConnected ? `Message #${currentRoom}...` : "Offline mode - messages won't be sent to server"
                    }
                    className="flex-1"
                  />
                  <Button onClick={handleSendMessage} disabled={!message.trim()}>
                    Send
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <h3 className="text-lg font-medium mb-2">Welcome to the Chat!</h3>
                  <p className="text-sm mb-4">
                    {rooms.length === 0
                      ? "Create your first room to get started"
                      : "Select a room from the sidebar to start chatting"}
                  </p>
                  {isConnected && rooms.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      {needsDefaultRoom ? "Creating default room..." : "Use the 'Create Room' button to begin"}
                    </p>
                  )}
                </div>
              </div>
            )}

            {!isConnected && (
              <div className="text-center text-sm text-muted-foreground">
                {isReconnecting ? (
                  <div className="animate-pulse">Reconnecting to chat server... (attempt {reconnectAttempts}/3)</div>
                ) : isOfflineMode ? (
                  <div className="space-y-2">
                    <div>Running in demo mode</div>
                    <div className="text-xs">Messages are stored locally for demonstration purposes.</div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div>Disconnected from chat server</div>
                    <div className="text-xs">Running in offline mode. Messages will be stored locally.</div>
                    {connectionError && (
                      <Button variant="outline" size="sm" onClick={retry}>
                        Try Reconnect
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
