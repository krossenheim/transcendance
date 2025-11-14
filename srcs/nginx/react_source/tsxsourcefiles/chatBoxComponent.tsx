"use client"

import { useImperativeHandle, useState, useEffect, useRef, forwardRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export type TypeStoredMessageSchema = {
  user: string
  content: string
  timestamp?: string
}

interface ChatBoxProps {
  username?: string
  userId?: number
  wsUrl?: string
  defaultRoomId?: number
}

export interface ChatBoxHandle {
  addMessageToChatBox: (data: TypeStoredMessageSchema) => void
}

export const ChatBox = forwardRef<ChatBoxHandle, ChatBoxProps>(
  ({ username = "You", userId = 4, wsUrl = "ws://localhost:3001/ws", defaultRoomId = 1 }, ref) => {
    const [messages, setMessages] = useState<TypeStoredMessageSchema[]>([])
    const [input, setInput] = useState("")
    const [roomId] = useState(defaultRoomId)
    const socketRef = useRef<WebSocket | null>(null)
    const joinedRef = useRef(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    useImperativeHandle(ref, () => ({
      addMessageToChatBox(data: TypeStoredMessageSchema) {
        setMessages((prev) => [...prev, data])
      },
    }))

    useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messages])

    useEffect(() => {
      const socket = new WebSocket(wsUrl)
      socketRef.current = socket

      socket.onopen = () => {
        console.log("WebSocket connected")
        if (!joinedRef.current) {
          const joinMessage = {
            funcId: "/api/chat/join_room",
            payload: { roomId },
            target_container: "chat",
          }
          socket.send(JSON.stringify(joinMessage))
          console.log("Sent join room message:", joinMessage)
          joinedRef.current = true
        }
      }

      socket.onmessage = (event) => {
        try {
          const payloadReceived = JSON.parse(event.data)
          
          // Log all received messages to debug
          console.log("Received WebSocket message:", payloadReceived)

          if (
            payloadReceived.source_container === "chat" &&
            payloadReceived.funcId === "/api/chat/send_message_to_room" &&
            payloadReceived.code === 0
          ) {
            const p = payloadReceived.payload
            console.log("Processing message payload:", p)

            // StoredMessageSchema has: messageId, roomId, messageString, messageDate, userId
            const newMessage: TypeStoredMessageSchema = {
              user: p.userId === userId ? username : `User ${p.userId}`,
              content: p.messageString || "",
              timestamp: p.messageDate || new Date().toISOString(),
            }

            console.log("Adding message:", newMessage)
            setMessages((prev) => [...prev, newMessage])
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error)
        }
      }

      socket.onerror = (error) => {
        console.error("WebSocket error:", error)
      }

      socket.onclose = () => {
        console.log("WebSocket connection closed")
      }

      return () => {
        socket.close()
      }
    }, [wsUrl, roomId, userId, username])

    const handleSend = () => {
      if (!input.trim()) return

      // Add message locally immediately (optimistic update)
      const localMessage: TypeStoredMessageSchema = {
        user: username,
        content: input,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, localMessage])

      // Also send via WebSocket if connected
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        const message = {
          funcId: "/api/chat/send_message_to_room",
          payload: {
            roomId,
            messageString: input,
          },
          target_container: "chat",
        }
        console.log("Sending message:", message)
        socketRef.current.send(JSON.stringify(message))
      } else {
        console.warn("WebSocket not connected")
      }

      setInput("")
    }

    return (
      <div className="w-full max-w-md flex flex-col bg-orange-500 shadow-lg rounded-2xl p-4 space-y-3 border-4 border-purple-600">
        <h2 className="text-xl font-semibold text-center text-white">🔥 LIVE CHAT (Room {roomId}) 🔥</h2>

        <div className="flex-1 overflow-y-auto bg-yellow-200 rounded-xl p-3 space-y-2 border-4 border-green-500 min-h-[200px] max-h-[400px]">
          {messages.length > 0 ? (
            messages.map((msg, i) => (
              <div
                key={i}
                className={`px-3 py-2 rounded-xl w-fit max-w-[80%] shadow-sm ${
                  msg.user === username
                    ? "bg-pink-500 text-white ml-auto"
                    : "bg-cyan-400 text-black"
                }`}
              >
                <span className="block text-xs opacity-70 mb-1">
                  {msg.user} • {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ""}
                </span>
                <div className="text-sm break-words">{msg.content}</div>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-center text-sm italic">No messages yet</p>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="Type a message..."
            className="flex-1"
            value={input}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && handleSend()}
          />
          <Button onClick={handleSend} className="px-6 bg-red-600 hover:bg-red-700">
            🚀 SEND
          </Button>
        </div>
      </div>
    )
  },
)

ChatBox.displayName = "ChatBox"