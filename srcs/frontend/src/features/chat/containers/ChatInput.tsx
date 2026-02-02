"use client"

import type React from "react"
import { useState, useRef, useEffect, useMemo, act } from "react"
import { useLanguage } from "../../../i18n/LanguageContext"
import { useWebSocket } from "../../../socketComponent"
import { user_url } from "@app/shared/api/service/common/endpoints"
import type { TypeRoomSchema } from '@app/shared/api/service/chat/db_models';
import { Result } from "@app/shared/api/service/common/result"
import { 
  getPossibleSlashCommands, 
  SlashCommand, 
} from "../../../utils/slashCommands"

type ExtendedArgDef = {
  description: string;
  type: 'text' | 'number';
  validator: (input: string) => Result<any, string>;
  autocomplete?: (input: string) => Promise<string[]> | string[];
}

interface ChatInputProps {
  roomData: TypeRoomSchema | undefined;
}

const COMMAND_PREFIX = "/";

export const ChatInput: React.FC<ChatInputProps> = ({ roomData }) => {
  const { t } = useLanguage()
  const { sendMessage } = useWebSocket()
  
  const [input, setInput] = useState("")
  const [activeCommand, setActiveCommand] = useState<SlashCommand<any> | null>(null)
  const [commandArgValues, setCommandArgValues] = useState<string[]>([])
  const [activeArgIndex, setActiveArgIndex] = useState<number>(0)
  const [argError, setArgError] = useState<string | null>(null)
  const randomId = useMemo(() => Math.random().toString(36).substring(7), []);

  const [selectedIndex, setSelectedIndex] = useState(0)
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false)
  const [argSuggestions, setArgSuggestions] = useState<string[]>([])
  const [showArgSuggestions, setShowArgSuggestions] = useState(false)

  const argInputRefs = useRef<(HTMLInputElement | null)[]>([])
  const mainInputRef = useRef<HTMLInputElement>(null)
  const sendButtonRef = useRef<HTMLButtonElement>(null)
  const suggestionsListRef = useRef<HTMLDivElement>(null)

  // --- Derived State ---
  const isCommand = input.startsWith(COMMAND_PREFIX);
  const commandPart = isCommand ? input.substring(COMMAND_PREFIX.length).toLowerCase() : ""
  
  const filteredCommands = isCommand && !activeCommand
    ? getPossibleSlashCommands(commandPart)
    : []

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
    if (!showCommandSuggestions && shouldShow) setSelectedIndex(0)
    setShowCommandSuggestions(shouldShow)
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

    if (currentIndex + 1 >= activeCommand.args.length) {
      setActiveArgIndex(activeCommand.args.length);
      sendButtonRef.current?.focus();
    } else {
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
      const argumentValue = commandArgValues[i] || '';
      const validationResult = (activeCommand.args[i] as ExtendedArgDef).validator(argumentValue);
      if (validationResult.isErr()) {
        console.log("Validation error:", validationResult.unwrapErr());
        return;
      }
      parsedArgs.push(validationResult.unwrap());
    }

    try {
      await activeCommand.execute(parsedArgs as any)
      exitCommandMode()
    } catch (e) {
      console.error("Error executing command:", e)
    }
  }

  const triggerError = (index: number, msg: string) => {
    setArgError(msg)
    setActiveArgIndex(index)
    argInputRefs.current[index]?.focus()
  }

  const handleStandardSend = () => {
    if (!input.trim() || !roomData) return
    sendMessage(user_url.ws.chat.sendMessage, {
      roomId: roomData.roomId,
      messageString: input,
    })
    setInput("")
    setShowCommandSuggestions(false)
  }

  const handleArgKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (!activeCommand) return
    const argDef = activeCommand.args[index] as ExtendedArgDef

    if (showArgSuggestions && argSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % argSuggestions.length);
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + argSuggestions.length) % argSuggestions.length);
        return;
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectArgSuggestion(argSuggestions[selectedIndex % argSuggestions.length]!);
        return;
      } else if (e.key === "Escape") {
        setShowArgSuggestions(false);
        return;
      }
    }

    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault()
      const validationResult = argDef.validator(commandArgValues[index]!);
      if (validationResult.isErr()) {
        triggerError(index, validationResult.unwrapErr());
        return;
      }

      setArgError(null);
      if (e.key === "Tab") {
        e.preventDefault();
        advanceToNextArg(index);
        return;
      } else {
        e.preventDefault()
        handleExecuteCommand();
        return;
      }
    } 
    else if (e.key === "Backspace" && commandArgValues[index] === "") {
        e.preventDefault()
        setArgError(null)
        if (index > 0) { setActiveArgIndex(index - 1) } 
        else { exitCommandMode(); setInput(`${COMMAND_PREFIX}${activeCommand.name}`) }
    }
  }

  const handleRawKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showCommandSuggestions && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      } else if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        enterCommandMode(filteredCommands[selectedIndex % filteredCommands.length]!);
        return;
      }
    }

    if (e.key === "Enter") {
      e.preventDefault()
      handleStandardSend()
    }
  }

  if (isCommand) {
    for (const command of filteredCommands) {
      if (input.startsWith(`${COMMAND_PREFIX}${command.name} `)) {
        enterCommandMode(command)
      }
    }
  }

  const handleSendButtonKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Backspace" && activeCommand) {
      e.preventDefault()
      setActiveArgIndex(activeCommand.args.length - 1)
      argInputRefs.current[activeCommand.args.length - 1]!.focus()
    }
  }

  return (
    <div className="p-4 flex-none glass-light-xs dark:glass-dark-xs glass-border border-t border-gray-200 dark:border-gray-700 z-20">
        <div className={`relative w-full border rounded-full bg-white dark:bg-gray-900/50 flex flex-nowrap items-center p-1 transition-colors min-h-[46px] shadow-sm ${
           argError 
             ? "border-red-500" 
             : "border-gray-300 dark:border-gray-600 focus-within:border-gray-400 dark:focus-within:border-gray-500"
        }`}>
          {activeCommand ? (
            <>
              <div className="flex-shrink-0 flex items-center bg-transparent text-purple-700 dark:text-purple-300 pl-3 pr-2 select-none border-r border-gray-300 dark:border-gray-600 h-6">
                <span className="font-bold text-sm">{COMMAND_PREFIX}{activeCommand.name}</span>
              </div>
              <div className="flex-1 flex flex-nowrap overflow-visible items-center relative pl-2">
                {activeCommand.args.map((argDef: any, idx: number) => (
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
                      placeholder={argDef.description}
                    />
                    {activeArgIndex === idx && (
                      <div className="absolute left-0 bottom-full w-full min-w-[200px] flex flex-col-reverse gap-2 z-[100] px-1 pointer-events-none mb-3">
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
                                        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-200 font-semibold pl-6' 
                                        : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200'
                                    }`}
                                    onMouseDown={(e) => { e.preventDefault(); selectArgSuggestion(sug); }}
                                  >
                                    {sug}
                                  </div>
                               ))}
                           </div>
                        )}
                        <div className="pointer-events-auto self-start animate-in fade-in slide-in-from-bottom-2">
                             {argError ? (
                                <div className="bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2">
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                  {argError}
                                </div>
                              ) : (
                                <div className="bg-gray-800 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg opacity-95 backdrop-blur-md flex items-center">
                                  <span className="text-blue-300 font-bold mr-1.5 tracking-wide">{activeCommand.args[activeArgIndex]?.type.toUpperCase()}</span>
                                  <span className="text-gray-200">{activeCommand.args[activeArgIndex]?.description}</span>
                                </div>
                              )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
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

          <button
            ref={sendButtonRef}
            onClick={activeCommand ? handleExecuteCommand : handleStandardSend}
            onKeyDown={handleSendButtonKeyDown}
            disabled={!roomData}
            className={`px-5 py-2 mr-1 rounded-full text-sm font-semibold transition-all ${
               roomData 
                 ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md active:scale-95' 
                 : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
          >
            {t('chat.send')}
          </button>

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
                    <span className="font-bold mr-2">{COMMAND_PREFIX}{cmd.name}</span>
                    <span className="text-gray-500 dark:text-gray-400 text-xs truncate">{cmd.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
    </div>
  )
}