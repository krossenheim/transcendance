"use client"

import { useEffect, useRef } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { StoredMessageSchema,StoredRoomSchema } from "utils/api/service/chat/db_models"

interface Message {
  id: number
  text: string
  sender: string
  timestamp: Date | string
  room: string
  isSystem?: boolean
}

interface User {
  id: string
  username: string
}

interface MessageListProps {
  messages: Message[]
  currentUser: User
}

export function MessageList({ messages, currentUser }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const formatTime = (timestamp: Date | string) => {
    const dateObj = timestamp instanceof Date ? timestamp : new Date(timestamp)
    return new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(dateObj)
  }

  const formatDate = (timestamp: Date | string) => {
    const messageDate = timestamp instanceof Date ? new Date(timestamp) : new Date(timestamp)
    const today = new Date()

    if (messageDate.toDateString() === today.toDateString()) {
      return "Today"
    }

    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (messageDate.toDateString() === yesterday.toDateString()) {
      return "Yesterday"
    }

    return messageDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: messageDate.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
    })
  }

  const groupMessagesByDate = (messages: Message[]) => {
    const groups: { [key: string]: Message[] } = {}

    messages.forEach((message) => {
      const timestamp = message.timestamp instanceof Date ? message.timestamp : new Date(message.timestamp)
      const dateKey = timestamp.toDateString()
      if (!groups[dateKey]) {
        groups[dateKey] = []
      }
      groups[dateKey].push({
        ...message,
        timestamp,
      })
    })

    return groups
  }

  const messageGroups = groupMessagesByDate(messages)

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <div className="text-lg font-medium">No messages yet</div>
          <div className="text-sm">Start the conversation!</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-4 pr-2">
      {Object.entries(messageGroups).map(([dateKey, dateMessages]) => (
        <div key={dateKey}>
          {/* Date separator */}
          <div className="flex items-center justify-center my-4">
            <div className="flex-1 border-t border-border" />
            <Badge variant="secondary" className="mx-4 text-xs">
              {formatDate(new Date(dateKey))}
            </Badge>
            <div className="flex-1 border-t border-border" />
          </div>

          {/* Messages for this date */}
          <div className="space-y-3">
            {dateMessages.map((message, index) => {
              const isCurrentUser = message.sender === currentUser.username
              const isSystem = message.isSystem
              const showAvatar = index === 0 || dateMessages[index - 1].sender !== message.sender

              if (isSystem) {
                return (
                  <div key={message.id} className="flex justify-center">
                    <Badge variant="outline" className="text-xs">
                      {message.text}
                    </Badge>
                  </div>
                )
              }

              return (
                <div key={message.id} className={cn("flex gap-3 group", isCurrentUser && "flex-row-reverse")}>
                  {/* Avatar */}
                  <div className="flex-shrink-0">
                    {showAvatar ? (
                      <Avatar className="w-8 h-8">
                        <AvatarFallback className="text-xs">{message.sender.charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="w-8 h-8" />
                    )}
                  </div>

                  {/* Message content */}
                  <div className={cn("flex-1 max-w-[70%]", isCurrentUser && "text-right")}>
                    {/* Sender name and timestamp */}
                    {showAvatar && (
                      <div className={cn("flex items-center gap-2 mb-1", isCurrentUser && "justify-end")}>
                        <span className="text-sm font-medium text-foreground">
                          {isCurrentUser ? "You" : message.sender}
                        </span>
                        <span className="text-xs text-muted-foreground">{formatTime(message.timestamp)}</span>
                      </div>
                    )}

                    {/* Message bubble */}
                    <div
                      className={cn(
                        "inline-block px-3 py-2 rounded-lg text-sm break-words",
                        isCurrentUser ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                        !showAvatar && "mt-1",
                      )}
                    >
                      {message.text}
                    </div>

                    {/* Timestamp for grouped messages */}
                    {!showAvatar && (
                      <div
                        className={cn(
                          "opacity-0 group-hover:opacity-100 transition-opacity mt-1",
                          isCurrentUser && "text-right",
                        )}
                      >
                        <span className="text-xs text-muted-foreground">{formatTime(message.timestamp)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  )
}
