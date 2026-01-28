"use client"

import type React from "react"
import { useState, useRef, useEffect, useMemo } from "react"
import { getUserColorCSS } from "../userColorUtils"
import type { RoomUser } from "./types"
import { useLanguage } from "../i18n/LanguageContext"

import { useChatStore } from "../stores/chatStore"
import { useGlobalStore } from "../stores/globalStore"
import { useWebSocket } from "../socketComponent"
import { user_url } from "@app/shared/api/service/common/endpoints"
import { useProfileModalStore } from "../stores/uiStore"

import { getPossibleSlashCommands, SlashCommand } from "../utils/slashCommands"
import { ChatRoomUserAccessType } from "@app/shared/api/service/chat/db_models"

interface ChatBoxProps {
  isJoined?: boolean
  onJoinRoom?: (roomId: number) => void
  onInvitePong: (roomUsers: RoomUser[]) => void
  onBlockUser: (userId: number) => void
  blockedUserIds: number[]
  roomUsers: RoomUser[]
  selfUserId: number
}

type ExtendedArgDef = {
  description: string;
  type: 'text' | 'number';
  validator?: (input: any) => any;
  autocomplete?: (input: string) => Promise<string[]> | string[];
}

const ChatBox: React.FC<ChatBoxProps> = ({
  isJoined = false,
  onJoinRoom,
  onInvitePong,
  onBlockUser,
  blockedUserIds,
  roomUsers,
  selfUserId,
}) => {
  const { t } = useLanguage()
  
  // --- State ---
  const [input, setInput] = useState("")
  
  // Command Mode State
  const [activeCommand, setActiveCommand] = useState<SlashCommand<any> | null>(null)
  const [commandArgValues, setCommandArgValues] = useState<string[]>([])
  const [activeArgIndex, setActiveArgIndex] = useState<number>(0)
  const [argError, setArgError] = useState<string | null>(null)
  
  const randomId = useMemo(() => Math.random().toString(36).substring(7), []);

  // Autocomplete State
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false)
  const [argSuggestions, setArgSuggestions] = useState<string[]>([])
  const [showArgSuggestions, setShowArgSuggestions] = useState(false)

  // History
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState<number>(-1)

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const argInputRefs = useRef<(HTMLInputElement | null)[]>([])
  const mainInputRef = useRef<HTMLInputElement>(null)
  const suggestionsListRef = useRef<HTMLDivElement>(null)

  // --- Store Hooks ---
  const { sendMessage } = useWebSocket();
  const messages = useChatStore(state => state.currentRoomMessages);
  const roomData = useChatStore(state => state.currentRoomId ? state.userChatRooms.get(state.currentRoomId) : undefined);
  const onlineUsers = useGlobalStore(state => state.onlineUsers);
  const publicUserDataCache = useGlobalStore(state => state.publicUserDataCache);
  const currentRoomUserConnections = useChatStore(state => state.currentRoomUserConnections);

  // --- Derived State ---
  const isCommand = input.startsWith("/")
  const commandPart = isCommand ? input.substring(1).toLowerCase() : ""
  
  const filteredCommands = isCommand && !activeCommand
    ? getPossibleSlashCommands(commandPart)
    : []

  // --- Effects ---

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Scroll Active Suggestion into View
  useEffect(() => {
    if (showArgSuggestions || showCommandSuggestions) {
      const activeItem = document.getElementById(`suggestion-item-${selectedIndex}`);
      if (activeItem) {
        activeItem.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, showArgSuggestions, showCommandSuggestions]);

  // Command Suggestions Toggle
  useEffect(() => {
    const shouldShow = isCommand && !activeCommand && filteredCommands.length > 0
    setShowCommandSuggestions(shouldShow)
    if (!showCommandSuggestions && shouldShow) setSelectedIndex(0)
  }, [isCommand, filteredCommands.length, activeCommand, showCommandSuggestions])

  // Argument Autocomplete
  useEffect(() => {
    let isActive = true;

    const fetchArgSuggestions = async () => {
      if (!activeCommand) return;
      
      const currentArgDef = activeCommand.args[activeArgIndex] as ExtendedArgDef;
      const currentVal = commandArgValues[activeArgIndex] || "";

      if (currentArgDef && typeof currentArgDef.autocomplete === 'function') {
        try {
          const result = currentArgDef.autocomplete(currentVal);
          const suggestions = result instanceof Promise ? await result : result;

          if (isActive) {
            if (Array.isArray(suggestions) && suggestions.length > 0) {
              setArgSuggestions(suggestions);
              setShowArgSuggestions(true);
              setSelectedIndex(0);
            } else {
              setShowArgSuggestions(false);
              setArgSuggestions([]);
            }
          }
        } catch (e) {
          if (isActive) setShowArgSuggestions(false);
        }
      } else {
        if (isActive) setShowArgSuggestions(false);
      }
    }

    if (activeCommand) {
      const timer = setTimeout(fetchArgSuggestions, 100);
      return () => { isActive = false; clearTimeout(timer); };
    }
  }, [activeCommand, activeArgIndex, commandArgValues])

  // Focus Management
  useEffect(() => {
    if (activeCommand) {
      argInputRefs.current[activeArgIndex]?.focus()
    } else {
      mainInputRef.current?.focus()
    }
  }, [activeArgIndex, activeCommand])

  // --- Actions ---

  const advanceToNextArg = (currentIndex: number) => {
    if (!activeCommand) return;
    setArgError(null);
    setShowArgSuggestions(false);
    
    if (currentIndex < activeCommand.args.length - 1) {
      setActiveArgIndex(currentIndex + 1);
    } 
  }

  const selectArgSuggestion = (value: string) => {
    const newArgs = [...commandArgValues];
    newArgs[activeArgIndex] = value;
    setCommandArgValues(newArgs);
    advanceToNextArg(activeArgIndex);
  }

  const enterCommandMode = (cmd: SlashCommand<any>) => {
    setActiveCommand(cmd)
    setCommandArgValues(new Array(cmd.args.length).fill("")) 
    setActiveArgIndex(0)
    setArgError(null)
    setInput("") 
    setShowCommandSuggestions(false)
  }

  const exitCommandMode = () => {
    setActiveCommand(null)
    setCommandArgValues([])
    setArgError(null)
    setTimeout(() => mainInputRef.current?.focus(), 0)
  }

  const handleExecuteCommand = async () => {
    if (!activeCommand) return

    const parsedArgs: any[] = []
    
    for (let i = 0; i < activeCommand.args.length; i++) {
      const def = activeCommand.args[i] as ExtendedArgDef
      const rawVal = commandArgValues[i]
      let val: string | number = rawVal
      
      if (def.type === 'number') {
        val = Number(rawVal)
        if (isNaN(val)) {
          triggerError(i, `Arg ${i+1}: Invalid number`)
          return
        }
      }
      if (def.validator) {
        const result = def.validator(val as never)
        if (result.isErr()) {
          triggerError(i, result.unwrapErr())
          return
        }
      }
      parsedArgs.push(val)
    }

    try {
      await activeCommand.execute(parsedArgs as any, { sendMessage });
      const reconstruct = `/${activeCommand.name} ${commandArgValues.join(' ')}`
      setCommandHistory(prev => [reconstruct, ...prev.slice(0, 49)])
      exitCommandMode()
    } catch (e) {
      setArgError("Execution failed")
      console.error(e);
    }
  }

  const triggerError = (index: number, msg: string) => {
    setArgError(msg)
    setActiveArgIndex(index)
    argInputRefs.current[index]?.focus()
  }

  const handleStandardSend = () => {
    if (!input.trim()) return
    sendMessage(user_url.ws.chat.sendMessage, {
      roomId: roomData!.roomId,
      messageString: input,
    })
    setInput("")
    setShowCommandSuggestions(false)
  }

  // --- Key Handlers ---

  const handleArgKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (!activeCommand) return
    const argDef = activeCommand.args[index] as ExtendedArgDef

    // 1. Suggestion Navigation
    if (showArgSuggestions && argSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedIndex(prev => (prev + 1) % argSuggestions.length)
        return
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedIndex(prev => (prev - 1 + argSuggestions.length) % argSuggestions.length)
        return
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        selectArgSuggestion(argSuggestions[selectedIndex]);
        return
      } else if (e.key === "Escape") {
        setShowArgSuggestions(false)
        return
      }
    }

    // 2. Standard Navigation
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault()
      
      const currentVal = commandArgValues[index]
      let valToCheck: string | number = currentVal
      if (argDef.type === 'number') valToCheck = Number(currentVal)

      if (argDef.type === 'number' && isNaN(valToCheck as number)) {
         triggerError(index, "Invalid number"); return;
      }
      if (argDef.validator) {
        const res = argDef.validator(valToCheck as never)
        if (res.isErr()) { triggerError(index, res.unwrapErr()); return; }
      }

      setArgError(null)

      if (index < activeCommand.args.length - 1) {
        advanceToNextArg(index);
      } else {
        handleExecuteCommand()
      }
    } 
    else if (e.key === "Backspace") {
      if (commandArgValues[index] === "") {
        e.preventDefault()
        setArgError(null)
        if (index > 0) {
          setActiveArgIndex(index - 1)
        } else {
          exitCommandMode()
          setInput(`/${activeCommand.name}`)
        }
      } else {
        setArgError(null)
      }
    }
  }

  const handleRawKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showCommandSuggestions && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % filteredCommands.length)
        return
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length)
        return
      } else if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault()
        enterCommandMode(filteredCommands[selectedIndex])
        return
      }
    }

    if (e.key === "Enter") {
      e.preventDefault()
      if (isCommand && filteredCommands.length > 0 && filteredCommands[0].name === commandPart) {
         enterCommandMode(filteredCommands[0])
      } else {
         handleStandardSend()
      }
    } else if (e.key === "ArrowUp") {
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
  }

  const handleOpenProfile = (userId: number) => {
    const { openProfileModal } = useProfileModalStore.getState();
    openProfileModal(userId);
  }

  if (!activeCommand && filteredCommands.length === 1 && commandPart.startsWith(`${filteredCommands[0]!.name} `)) {
    enterCommandMode(filteredCommands[0]!);
  }

  return (
    <div className="glass-light-sm dark:glass-dark-sm glass-border h-full max-h-[600px] flex flex-col overflow-hidden relative">
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gradient-to-r from-blue-500/70 to-purple-500/70 flex-none">
        <h2 className="text-lg font-semibold text-white">
          {roomData ? `#${roomData.roomName}` : t('chat.selectRoom')}
        </h2>
        {roomData && (
          isJoined ? (
            <button onClick={() => onInvitePong(roomUsers)} className="px-3 py-1 text-sm bg-pink-500 text-white hover:bg-pink-600 transition-all shadow-md rounded-md">
              🏓 {t('chat.inviteToPong')}
            </button>
          ) : (
            <button onClick={() => roomData && onJoinRoom && onJoinRoom(roomData.roomId)} className="px-3 py-1 text-sm bg-blue-500 text-white hover:bg-blue-600 transition-all shadow-md rounded-md">
              ➕ {t('chat.joinRoom')}
            </button>
          )
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Messages List */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col">
          {messages.filter(msg => msg.userId === undefined || !blockedUserIds.includes(msg.userId)).map((msg, i) => {
              const userColor = msg.userId !== undefined ? getUserColorCSS(msg.userId, true) : undefined
              const userData = publicUserDataCache.get(msg.userId!);

              if (userData === undefined) {
                sendMessage(user_url.ws.users.requestUserProfileData, msg.userId);
              }

              const visibleUsername = userData ? userData.alias || userData.username : msg.user || `User ${msg.userId}`;
              const timestamp = msg.messageDate ? new Date(msg.messageDate * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

              const isSelf = msg.userId === selfUserId;

              return (
                <div key={i} className={`flex flex-col mb-3 ${isSelf ? 'items-end' : 'items-start'}`}>
                    
                    {/* Header Row: Username + Time */}
                    <div className={`flex items-baseline gap-2 mb-1 px-1 ${isSelf ? 'flex-row-reverse' : 'flex-row'}`}>
                      <span 
                        onClick={() => msg.userId && handleOpenProfile(msg.userId)} 
                        className="text-sm font-bold hover:underline cursor-pointer" 
                        style={{ color: userColor }}
                      >
                        {visibleUsername}
                      </span>
                      {timestamp && (
                        <span className="text-[10px] text-gray-400 select-none">
                          {timestamp}
                        </span>
                      )}
                    </div>
                    
                    {/* Message Bubble */}
                    <div className={`px-4 py-2 max-w-[85%] shadow-sm text-sm break-words leading-relaxed
                        ${isSelf 
                           ? 'bg-blue-600 text-white rounded-2xl rounded-tr-none' 
                           : 'glass-light-xs dark:glass-dark-xs glass-border text-gray-900 dark:text-gray-100 rounded-2xl rounded-tl-none'
                        }
                    `}> 
                      <p>{msg.messageString}</p>
                    </div>
                </div>
              )
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* User Sidebar */}
        {currentRoomUserConnections && (
          <div className="w-48 glass-light-xs dark:glass-dark-xs glass-border border-l border-gray-200 dark:border-gray-700 overflow-y-auto hidden md:block">
            <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 sticky top-0 backdrop-blur-sm z-10">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">{t('chat.users')} ({roomUsers.length})</h3>
            </div>
            <div className="p-2 space-y-1">
              {[...currentRoomUserConnections]
                .filter(user => user.userState === ChatRoomUserAccessType.JOINED)
                .sort((a, b) => {
                  const statusA = onlineUsers.has(a.userId) ? 1 : 0
                  const statusB = onlineUsers.has(b.userId) ? 1 : 0
                  if (statusA !== statusB) return statusB - statusA
                  const userA = publicUserDataCache.get(a.userId)?.username || ''
                  const userB = publicUserDataCache.get(b.userId)?.username || ''
                  return userA.localeCompare(userB)
                })
                .map((user) => {
                  const userData = publicUserDataCache.get(user.userId);
                  const visibleUsername = userData ? userData.alias || userData.username : `User ${user.userId}`;
                  const isOnline = onlineUsers.has(user.userId);
                  const userColor = getUserColorCSS(user.userId, true)
                  
                  return (
                    <div
                      key={user.userId}
                      onClick={() => handleOpenProfile(user.userId)}
                      className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-200 dark:hover:bg-gray-700/60 cursor-pointer rounded-md transition-colors group"
                    >
                      <div className="relative">
                        <div className={`w-2.5 h-2.5 rounded-full ring-2 ring-offset-1 ring-offset-transparent transition-colors ${
                          isOnline ? 'bg-green-500 ring-green-500/20' : 'bg-gray-400 ring-gray-400/20'
                        }`} />
                      </div>
                      <span className="text-xs font-medium truncate group-hover:opacity-100 opacity-90 transition-opacity" style={{ color: userColor }}>
                        {visibleUsername}
                      </span>
                    </div>
                  )
                }
              )}
            </div>
          </div>
        )}

      </div>

      {/* Input Area */}
      <div className="p-4 flex-none glass-light-xs dark:glass-dark-xs glass-border border-t border-gray-200 dark:border-gray-700 z-20">
        
        {/* Input Container */}
        <div className={`relative w-full border rounded-full bg-white dark:bg-gray-900/50 flex flex-nowrap items-center p-1 transition-colors min-h-[46px] shadow-sm ${
           argError 
             ? "border-red-500" 
             : "border-gray-300 dark:border-gray-600 focus-within:border-gray-400 dark:focus-within:border-gray-500"
        }`}>
          
          {activeCommand ? (
            /* --- Command Mode --- */
            <>
              {/* Badge */}
              <div className="flex-shrink-0 flex items-center bg-transparent text-purple-700 dark:text-purple-300 pl-3 pr-2 select-none border-r border-gray-300 dark:border-gray-600 h-6">
                <span className="font-bold text-sm">/{activeCommand.name}</span>
              </div>

              {/* Arguments */}
              <div className="flex-1 flex flex-nowrap overflow-visible items-center relative pl-2">
                {activeCommand.args.map((argDef, idx) => (
                  <div key={idx} className="relative min-w-[100px] flex-shrink-0 mr-2 group">
                    <input
                      ref={(el) => { argInputRefs.current[idx] = el }}
                      type="text"
                      
                      autoComplete="off"
                      data-lpignore="true" 
                      data-1p-ignore="true"
                      data-form-type="other"
                      name={`cmd_arg_${idx}_${randomId}`}
                      id={`input_arg_${idx}_${randomId}`} 
                      
                      value={commandArgValues[idx]}
                      onChange={(e) => {
                        const newArgs = [...commandArgValues]
                        newArgs[idx] = e.target.value
                        setCommandArgValues(newArgs)
                      }}
                      onKeyDown={(e) => handleArgKeyDown(e, idx)}
                      onFocus={() => { setActiveArgIndex(idx); setArgError(null); }}
                      
                      className={`w-full text-sm outline-none px-2 py-1 bg-transparent transition-all rounded-md border focus:outline-none focus:ring-0 shadow-none ${
                        activeArgIndex === idx 
                          ? (argError ? "border-red-400 bg-red-50 dark:bg-red-900/10" : "border-blue-400 bg-blue-50/30 dark:bg-blue-900/10") 
                          : "border-transparent hover:border-gray-200 dark:hover:border-gray-700 text-gray-500 dark:text-gray-400"
                      }`}
                      placeholder={argDef.type === 'number' ? '#' : argDef.description.split(' ')[0]}
                    />
                  </div>
                ))}
              </div>

              {/* FULL WIDTH POPUP CONTAINER (Bottom-Up Stack) */}
              <div className="absolute left-0 bottom-full w-full mb-3 flex flex-col-reverse gap-2 z-[100] px-1 pointer-events-none">
                  
                  {/* 1. Helper Text / Error (Stays on bottom, just above input) */}
                  <div className="pointer-events-auto self-start animate-in fade-in slide-in-from-bottom-2">
                      {argError ? (
                        <div className="bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                             <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          {argError}
                        </div>
                      ) : (
                        <div className="bg-gray-800 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg opacity-95 backdrop-blur-md flex items-center">
                          <span className="text-blue-300 font-bold mr-1.5 tracking-wide">{activeCommand.args[activeArgIndex]?.type.toUpperCase()}</span>
                          <span className="text-gray-200">{activeCommand.args[activeArgIndex]?.description}</span>
                        </div>
                      )}
                  </div>

                  {/* 2. Autocomplete Suggestions (Sits above Helper) */}
                  {showArgSuggestions && argSuggestions.length > 0 && (
                     <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-2xl rounded-xl overflow-hidden pointer-events-auto max-h-60 overflow-y-auto no-scrollbar w-full animate-in slide-in-from-bottom-2">
                         <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700 text-xs font-bold text-gray-500 uppercase tracking-wider">
                           Suggestions
                         </div>
                         {argSuggestions.map((sug, sIdx) => (
                            <div 
                              key={sug}
                              id={`suggestion-item-${sIdx}`}
                              className={`px-4 py-2.5 text-sm cursor-pointer border-b border-gray-100 dark:border-gray-700/50 last:border-0 transition-colors ${
                                sIdx === selectedIndex 
                                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-200 font-semibold pl-6' // slight indent on select
                                  : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'
                              }`}
                              onMouseDown={(e) => {
                                  e.preventDefault() 
                                  selectArgSuggestion(sug);
                              }}
                            >
                              {sug}
                            </div>
                         ))}
                     </div>
                  )}
              </div>
            </>
          ) : (
            /* --- Standard Chat Input --- */
            <input
              ref={mainInputRef}
              type="text"
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore="true"
              name={`chat_main_${randomId}`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleRawKeyDown}
              className="flex-1 bg-transparent outline-none focus:outline-none focus:ring-0 shadow-none border-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 py-1.5 px-4 min-w-0"
              placeholder={roomData ? t('chat.typePlaceholder') : t('chat.selectRoomFirst')}
              disabled={!roomData}
            />
          )}

          {/* Send Button */}
          <button
            onClick={activeCommand ? handleExecuteCommand : handleStandardSend}
            disabled={!roomData}
            className={`px-5 py-2 mr-1 rounded-full text-sm font-semibold transition-all ${
               roomData 
                 ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md active:scale-95' 
                 : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
          >
            {t('chat.send')}
          </button>

          {/* Command List Suggestions */}
          {showCommandSuggestions && (
            <div className="absolute left-0 bottom-full mb-3 w-72 glass-light-sm dark:glass-dark-sm glass-border shadow-2xl rounded-xl z-[90] overflow-hidden flex flex-col no-scrollbar">
              <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Slash Commands</span>
              </div>
              <div className="max-h-60 overflow-y-auto no-scrollbar" ref={suggestionsListRef}>
                {filteredCommands.map((cmd, idx) => (
                  <button
                    key={cmd.name}
                    id={`suggestion-item-${idx}`}
                    onMouseDown={(e) => { e.preventDefault(); enterCommandMode(cmd); }}
                    className={`w-full text-left px-4 py-2.5 text-sm block transition-colors border-l-4 ${
                      idx === selectedIndex 
                        ? "bg-purple-50 dark:bg-purple-900/30 text-purple-700 border-purple-500" 
                        : "hover:bg-gray-50 dark:hover:bg-gray-800/50 border-transparent text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    <span className="font-bold mr-2">/{cmd.name}</span>
                    <span className="text-gray-500 dark:text-gray-400 text-xs truncate">{cmd.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ChatBox