"use client"

import type { TypeStoredMessageSchema, TypeRoomSchema } from "./types/chat-models"
import { useCallback, useEffect, useState } from "react"
import { user_url } from "@app/shared/api/service/common/endpoints"
import { useWebSocket } from "./socketComponent"
import ProfileComponent from "./profileComponent"
import { useFriendshipContext } from "./friendshipContext"
import { ChatBox, RoomList } from "./chat"
import { HandlerResult } from "./socketComponent"

import { useGlobalStore } from "./features/global/store/globalStore"
import { useChatStore } from "./features/chat/store/chatStore"
import { ChatRoomUserAccessType } from "@app/shared/api/service/chat/db_models"

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

  // import { useChatStore } from 'path/to/store';

// 🕵️‍♂️ THE TRAP
useChatStore.subscribe((state, prevState) => {
    const oldSize = prevState.messages.data.messagesPerRoom.size;
    const newSize = state.messages.data.messagesPerRoom.size;

    // Trigger only when data disappears
    if (oldSize > 0 && newSize === 0) {
        console.group("🚨 DETECTED STATE WIPE!");
        console.log("Previous Size:", oldSize);
        console.log("New Size:", newSize);
        console.trace("Who triggered this?"); // <--- THIS IS THE KEY
        console.groupEnd();
    }
});

  const [blockedUserIds, setBlockedUserIds] = useState<number[]>([])
  const [profileUserId, setProfileUserId] = useState<number | null>(null)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [pendingFriendshipRequests, setPendingFriendshipRequests] = useState<Array<{ userId: number; username: string; alias?: string | null }>>([])
  const [pendingDMTargetId, setPendingDMTargetId] = useState<number | null>(null)
  const [currentRoomUsers, setCurrentRoomUsers] = useState<Array<{ id: number; username: string; onlineStatus?: number }>>([])
  const [pendingProfileLookup, setPendingProfileLookup] = useState<string | null>(null)
  
  const onlineUsers = useGlobalStore(state => state.users.data.onlineUsers);
  const publicUserDataCache = useGlobalStore(state => state.users.data.userCache);

  // const onlineUsersRef = useRef<Set<number>>(new Set())
  const [pendingRoomInvites, setPendingRoomInvites] = useState<Array<{ roomId: number; roomName: string; inviterId: number; inviterUsername: string }>>([])
  const [pendingDmInvites, setPendingDmInvites] = useState<Array<{ roomId: number; oderId: number; username: string }>>([])

  useEffect(() => {
    console.log("Updated userMap:", publicUserDataCache)
  }, [publicUserDataCache])

  useEffect(() => {
    console.log("Online users updated:", onlineUsers)
  }, [onlineUsers])

  // useEffect(() => {
  //   console.log("User chat rooms updated:", userChatRooms)
  // }, [userChatRooms])

  // useEffect(() => {
  //   const unsubs: Array<() => void> = [];

  //   unsubs.push(subscribe(user_url.ws.chat.listRooms, (message, schema) => {
  //     switch (message.code) {
  //       case schema.output.FullListGiven.code:
  //         setUserChatRooms(message.payload);
  //         return HandlerResult.Handled;

  //       default:
  //         return HandlerResult.NotHandled;
  //     }
  //   }));

  //   unsubs.push(subscribe(user_url.ws.chat.getRoomData, (message, schema) => {
  //     switch (message.code) {
  //       case schema.output.RoomDataProvided.code:
  //         setSingleUserChatRoom(message.payload.room);
  //         cachePublicUserData(message.payload.users);
  //         setCurrentRoomData(message.payload);
  //         resetUnreadCount(message.payload.room.roomId);
  //         return HandlerResult.Handled;

  //       default:
  //         return HandlerResult.NotHandled;
  //     }
  //   }));

  //   unsubs.push(subscribe(user_url.ws.chat.sendMessage, (message, schema) => {
  //     switch (message.code) {
  //       case schema.output.MessageSent.code:
  //         const currentRoomId = useChatStore.getState().currentRoomId;
  //         if (currentRoomId === message.payload.roomId)
  //           addRoomMessage(message.payload);
  //         else
  //           incrementUnreadCount(message.payload.roomId);
  //         return HandlerResult.Handled;

  //       default:
  //         return HandlerResult.NotHandled;
  //     }
  //   }));

  //   unsubs.push(subscribe(user_url.ws.chat.addRoom, (message, schema) => {
  //     switch (message.code) {
  //       case schema.output.AddedRoom.code:
  //         setSingleUserChatRoom(message.payload);
  //         sendMessage(user_url.ws.chat.getRoomData, { roomId: message.payload.roomId });
  //         return HandlerResult.Handled;
        
  //       default:
  //         return HandlerResult.NotHandled;
  //     }
  //   }));

  //   unsubs.push(subscribe(user_url.ws.chat.sendDirectMessage, (message, schema) => {
  //     switch (message.code) {
  //       case schema.output.MessageSent.code:
  //         sendMessage(user_url.ws.chat.getRoomData, { roomId: message.payload.roomId });
  //         return HandlerResult.Handled;
        
  //       default:
  //         return HandlerResult.NotHandled;
  //     }
  //   }));

  //   unsubs.push(subscribe(user_url.ws.chat.leaveRoom, (message, schema) => {
  //     switch (message.code) {
  //       case schema.output.RoomLeft.code:
  //         leaveRoom(message.payload.roomId);
  //         return HandlerResult.Handled;

  //       default:
  //         return HandlerResult.NotHandled;
  //     }
  //   }));

  //   unsubs.push(subscribe(user_url.ws.chat.joinRoom, (message, schema) => {
  //     switch (message.code) {
  //       case schema.output.RoomJoined.code:
  //         const currentRoomId = useChatStore.getState().currentRoomId;
  //         if (currentRoomId === message.payload.roomId)
  //           updateUserRoomState(message.payload.user, ChatRoomUserAccessType.JOINED);
  //         return HandlerResult.Handled;

  //       default:
  //         return HandlerResult.NotHandled;
  //     }
  //   }));

  //   unsubs.push(subscribe(user_url.ws.chat.addUserToRoom, (message, schema) => {
  //     switch (message.code) {
  //       case schema.output.UserAdded.code:
  //         const currentRoomId = useChatStore.getState().currentRoomId;
  //         if (currentRoomId === message.payload.roomId)
  //           updateUserRoomState(message.payload.user, ChatRoomUserAccessType.INVITED);
  //         return HandlerResult.Handled;

  //       default:
  //         return HandlerResult.NotHandled;
  //     }
  //   }))

  //   return () => {
  //     unsubs.forEach((unsub) => unsub());
  //   };
  // }, [subscribe, sendMessage]);

  useEffect(() => {
    sendMessage(user_url.ws.chat.listRooms, {});
    sendMessage(user_url.ws.users.fetchUserConnections, null);
  }, []);

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

  const handleInvitePong = useCallback((roomUsers: Array<{ id: number; username: string; onlineStatus?: number }>) => {
    if (!storeCurrentRoomId) return
    console.log("Inviting to pong in room:", storeCurrentRoomId)
    if (onOpenPongInvite) {
      onOpenPongInvite(roomUsers)
    } else if (showToast) {
      showToast("Pong invitation feature not yet implemented", 'error')
    }
  }, [showToast, onOpenPongInvite])

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