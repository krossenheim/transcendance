import React, { createContext, useState, useCallback, ReactNode } from 'react'

export interface PendingFriendshipRequest {
  userId: number
  username: string
  alias?: string | null
}

export interface RoomInvite {
  roomId: number
  roomName: string
  inviterId: number
  inviterUsername: string
}

export interface DmInvite {
  roomId: number
  oderId: number  // other user's id
  username: string
}

interface FriendshipContextType {
  pendingRequests: PendingFriendshipRequest[]
  setPendingRequests: (requests: PendingFriendshipRequest[]) => void
  handleAcceptFriendship: (userId: number) => void
  handleDenyFriendship: (userId: number) => void
  setAcceptHandler: (handler: (userId: number) => void) => void
  setDenyHandler: (handler: (userId: number) => void) => void
  // Room invites
  roomInvites: RoomInvite[]
  setRoomInvites: (invites: RoomInvite[]) => void
  handleAcceptRoomInvite: (roomId: number, roomName?: string) => void
  handleDeclineRoomInvite: (roomId: number) => void
  setAcceptRoomInviteHandler: (handler: (roomId: number, roomName?: string) => void) => void
  setDeclineRoomInviteHandler: (handler: (roomId: number) => void) => void
  // DM invites
  dmInvites: DmInvite[]
  setDmInvites: (invites: DmInvite[]) => void
  handleAcceptDmInvite: (roomId: number) => void
  handleDeclineDmInvite: (roomId: number) => void
  setAcceptDmInviteHandler: (handler: (roomId: number) => void) => void
  setDeclineDmInviteHandler: (handler: (roomId: number) => void) => void
}

const FriendshipContext = createContext<FriendshipContextType | undefined>(undefined)

export function FriendshipProvider({ children }: { children: ReactNode }) {
  const [pendingRequests, setPendingRequests] = useState<PendingFriendshipRequest[]>([])
  const [acceptHandler, setAcceptHandler] = useState<(userId: number) => void>(() => { })
  const [denyHandler, setDenyHandler] = useState<(userId: number) => void>(() => { })

  // Room invites state
  const [roomInvites, setRoomInvites] = useState<RoomInvite[]>([])
  const [acceptRoomInviteHandler, setAcceptRoomInviteHandler] = useState<(roomId: number, roomName?: string) => void>(() => { })
  const [declineRoomInviteHandler, setDeclineRoomInviteHandler] = useState<(roomId: number) => void>(() => { })

  // DM invites state
  const [dmInvites, setDmInvites] = useState<DmInvite[]>([])
  const [acceptDmInviteHandler, setAcceptDmInviteHandler] = useState<(roomId: number) => void>(() => { })
  const [declineDmInviteHandler, setDeclineDmInviteHandler] = useState<(roomId: number) => void>(() => { })

  const handleAcceptFriendship = useCallback(
    (userId: number) => {
      acceptHandler(userId)
    },
    [acceptHandler],
  )

  const handleDenyFriendship = useCallback(
    (userId: number) => {
      denyHandler(userId)
    },
    [denyHandler],
  )

  const handleAcceptRoomInvite = useCallback(
    (roomId: number, roomName?: string) => {
      // Forward roomId and optional roomName to the registered handler
      try {
        acceptRoomInviteHandler(roomId, roomName)
      } catch {
        // Handler may ignore second param; best-effort forwarding
        try { acceptRoomInviteHandler(roomId) } catch { }
      }
    },
    [acceptRoomInviteHandler],
  )

  const handleDeclineRoomInvite = useCallback(
    (roomId: number) => {
      declineRoomInviteHandler(roomId)
    },
    [declineRoomInviteHandler],
  )

  const handleAcceptDmInvite = useCallback(
    (roomId: number) => {
      acceptDmInviteHandler(roomId)
    },
    [acceptDmInviteHandler],
  )

  const handleDeclineDmInvite = useCallback(
    (roomId: number) => {
      declineDmInviteHandler(roomId)
    },
    [declineDmInviteHandler],
  )

  return (
    <FriendshipContext.Provider
      value={{
        pendingRequests,
        setPendingRequests,
        handleAcceptFriendship,
        handleDenyFriendship,
        setAcceptHandler,
        setDenyHandler,
        roomInvites,
        setRoomInvites,
        handleAcceptRoomInvite,
        handleDeclineRoomInvite,
        setAcceptRoomInviteHandler,
        setDeclineRoomInviteHandler,
        dmInvites,
        setDmInvites,
        handleAcceptDmInvite,
        handleDeclineDmInvite,
        setAcceptDmInviteHandler,
        setDeclineDmInviteHandler,
      }}
    >
      {children}
    </FriendshipContext.Provider>
  )
}

export function useFriendshipContext() {
  const context = React.useContext(FriendshipContext)
  if (!context) {
    throw new Error('useFriendshipContext must be used within FriendshipProvider')
  }
  return context
}
