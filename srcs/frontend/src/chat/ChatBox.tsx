"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { getUserColorCSS } from "../userColorUtils"
import type { ChatMessage, RoomUser, SlashCommand } from "./types"

interface ChatBoxProps {
  messages: ChatMessage[]
  onSendMessage: (content: string) => void
  currentRoom: number | null
  currentRoomName: string | null
  isJoined?: boolean
  onJoinRoom?: (roomId: number) => void
  onInvitePong: (roomUsers: RoomUser[]) => void
  onBlockUser: (userId: number) => void
  blockedUserIds: number[]
  onOpenProfile: (username: string) => void
  roomUsers: RoomUser[]
  selfUserId: number
}

const commands: SlashCommand[] = [
  { name: "me", description: "Send an action/emote message" },
  { name: "whisper", description: "(alias /w) Not implemented private whisper", aliases: ["w"] },
  { name: "invite", description: "Invite user(s) to current room: /invite user1 user2 ..." },
  { name: "debug", description: "Send raw WebSocket message (debug)" },
  { name: "help", description: "Show available commands" },
]

const ChatBox: React.FC<ChatBoxProps> = ({
  messages,
  onSendMessage,
  currentRoom,
  currentRoomName,
  isJoined = false,
  onJoinRoom,
  onInvitePong,
  onBlockUser,
  blockedUserIds,
  onOpenProfile,
  roomUsers,
  selfUserId,
}) => {
  const [input, setInput] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState<number>(-1)

  // Check if input is a slash command
  const isCommand = input.startsWith("/")
  const commandPart = isCommand ? input.substring(1).toLowerCase() : ""
  const filteredCommands = isCommand
    ? commands.filter(
        (cmd) =>
          cmd.name.startsWith(commandPart) ||
          (cmd.aliases && cmd.aliases.some((a) => a.startsWith(commandPart)))
      )
    : []

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Show suggestions when typing slash command
  useEffect(() => {
    setShowSuggestions(isCommand && filteredCommands.length > 0)
    setSelectedIndex(0)
  }, [isCommand, filteredCommands.length])

  const handleSend = () => {
    if (!input.trim()) return
    // Save to command history if it's a slash command
    if (input.startsWith("/")) {
      setCommandHistory((prev) => [input, ...prev.slice(0, 49)]) // Keep last 50
      setHistoryIndex(-1)
    }
    onSendMessage(input)
    setInput("")
    setShowSuggestions(false)
  }

  const applySuggestion = (cmd: SlashCommand) => {
    setInput(`/${cmd.name} `)
    setShowSuggestions(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions) {
      if (e.key === "Enter") {
        e.preventDefault()
        handleSend()
      } else if (e.key === "ArrowUp") {
        // Navigate command history
        if (commandHistory.length > 0) {
          e.preventDefault()
          const newIndex = Math.min(historyIndex + 1, commandHistory.length - 1)
          setHistoryIndex(newIndex)
          setInput(commandHistory[newIndex])
        }
      } else if (e.key === "ArrowDown") {
        if (historyIndex > 0) {
          e.preventDefault()
          const newIndex = historyIndex - 1
          setHistoryIndex(newIndex)
          setInput(commandHistory[newIndex])
        } else if (historyIndex === 0) {
          e.preventDefault()
          setHistoryIndex(-1)
          setInput("")
        }
      }
      return
    }

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === "Tab") {
      e.preventDefault()
      if (filteredCommands.length > 0) {
        applySuggestion(filteredCommands[selectedIndex])
      }
    } else if (e.key === "Enter") {
      e.preventDefault()
      handleSend()
    } else if (e.key === "Escape") {
      setShowSuggestions(false)
    }
  }

  return (
    <div className="glass-light-sm dark:glass-dark-sm glass-border h-[600px] flex flex-col overflow-hidden" role="main" aria-label="Chat interface">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gradient-to-r from-blue-500/70 to-purple-500/70">
        <h2 className="text-lg font-semibold text-white" id="chat-room-title">
          {currentRoomName ? `#${currentRoomName}` : "Select a Room"}
        </h2>
        {currentRoom && (
          isJoined ? (
            <button
              onClick={() => onInvitePong(roomUsers)}
              className="px-3 py-1 text-sm bg-pink-500 text-white hover:bg-pink-600 transition-all"
              aria-label="Invite users to pong game"
            >
              🏓 Invite to Pong
            </button>
          ) : (
            <button
              onClick={() => currentRoom && onJoinRoom && onJoinRoom(currentRoom)}
              className="px-3 py-1 text-sm bg-blue-500 text-white hover:bg-blue-600 transition-all"
              aria-label="Join this room"
            >
              ➕ Join Room
            </button>
          )
        )}
      </div>

      {/* Messages + Users */}
      <div className="flex-1 flex overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3" role="log" aria-live="polite" aria-label="Chat messages">
        {messages.length > 0 ? (
          messages
            .filter((msg) => msg.userId === undefined || !blockedUserIds.includes(msg.userId))
            .map((msg, i) => {
              const userColor = msg.userId !== undefined ? getUserColorCSS(msg.userId, true) : undefined
              const isBlocked = msg.userId !== undefined && blockedUserIds.includes(msg.userId)
              return (
                <div key={i} className="flex justify-start">
                  <div className="px-4 py-2 max-w-[70%] shadow-sm glass-light-xs dark:glass-dark-xs glass-border text-gray-900" role="article" aria-label={`Message from ${msg.user}`}> 
                    <div className="flex justify-between items-center">
                      <span
                        onClick={() => onOpenProfile(msg.user)}
                        className="block text-xs font-bold mb-1 hover:underline cursor-pointer"
                        style={{ color: userColor }}
                      >
                        {msg.user}
                      </span>
                      {msg.userId !== undefined && msg.userId !== selfUserId && msg.userId !== 1 && (
                        <button
                          onClick={() => onBlockUser(msg.userId!)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          {isBlocked ? "Unblock" : "Block"}
                        </button>
                      )}
                    </div>
                    <p className="text-sm">{msg.content}</p>
                    {msg.timestamp && (
                      <span className="block text-xs text-gray-400 mt-1">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                </div>
              )
            })
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
          <div className="w-48 glass-light-xs dark:glass-dark-xs glass-border overflow-y-auto" role="complementary" aria-label="Online users list">
            <div className="p-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900">Users ({roomUsers.length})</h3>
            </div>
            <div className="p-2 space-y-1">
              {roomUsers.map((user) => {
                const userColor = getUserColorCSS(user.id, true)
                return (
                  <div
                    key={user.id}
                    onClick={() => onOpenProfile(user.username)}
                    className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700/40 cursor-pointer transition-colors"
                    role="button"
                    tabIndex={0}
                    aria-label={`View ${user.username}'s profile, ${user.onlineStatus === 1 ? 'online' : 'offline'}`}
                  >
                    <div className={`w-2 h-2 rounded-full ${
                      user.onlineStatus === 1 ? 'bg-green-500' : 'bg-gray-400'
                    }`} />
                    <span className="text-sm font-bold truncate" style={{ color: userColor }}>
                      {user.username}
                    </span>
                  </div>
                )
              })}
              {roomUsers.length === 0 && (
                <div className="text-xs text-gray-400 text-center py-4">No users</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 glass-light-xs dark:glass-dark-xs glass-border">
        <div className="flex space-x-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder={currentRoom ? "Type a message..." : "Select a room first..."}
              className={`w-full border rounded-full px-4 py-2 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 glass-light-xs dark:glass-dark-xs ${
                isCommand
                  ? "border-purple-500 text-purple-700 focus:ring-purple-400"
                  : "border-gray-300 dark:border-gray-600 focus:ring-blue-400"
              } disabled:bg-gray-100/30 dark:disabled:bg-gray-900/30`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              aria-label="Message input"
              aria-describedby="chat-room-title"
              disabled={!currentRoom}
            />
            {showSuggestions && isCommand && filteredCommands.length > 0 && (
              <div className="absolute left-0 right-0 bottom-full mb-2 glass-light-sm dark:glass-dark-sm glass-border shadow-lg z-50 overflow-hidden max-h-64 overflow-y-auto" role="listbox" aria-label="Command suggestions">
                {filteredCommands.map((cmd, idx) => (
                  <button
                    key={cmd.name}
                    type="button"
                    onClick={() => applySuggestion(cmd)}
                    className={`w-full text-left px-4 py-2 text-sm flex flex-col ${
                      idx === selectedIndex ? "bg-purple-500 text-white" : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"
                    }`}
                    role="option"
                    aria-selected={idx === selectedIndex}
                  >
                    <span className="font-medium">/{cmd.name}{cmd.aliases ? ` (${cmd.aliases.map(a=>`/${a}`).join(', ')})` : ''}</span>
                    <span className={idx === selectedIndex ? "text-purple-100" : "text-gray-500 dark:text-gray-400"}>{cmd.description}</span>
                  </button>
                ))}
                {filteredCommands.length === 0 && (
                  <div className="px-4 py-2 text-sm text-gray-500">No matching commands</div>
                )}
                <div className="px-4 py-1 text-[11px] bg-gray-50 dark:bg-gray-900/70 text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
                  <span className="mr-2">↕ to navigate</span>
                  <span className="mr-2">Tab to autocomplete</span>
                  <span>Enter to send</span>
                </div>
              </div>
            )}
          </div>
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

export default ChatBox
