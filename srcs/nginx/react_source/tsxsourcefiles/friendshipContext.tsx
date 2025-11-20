import React, { createContext, useState, useCallback, ReactNode } from 'react'

export interface PendingFriendshipRequest {
  userId: number
  username: string
  alias?: string | null
}

interface FriendshipContextType {
  pendingRequests: PendingFriendshipRequest[]
  setPendingRequests: (requests: PendingFriendshipRequest[]) => void
  handleAcceptFriendship: (userId: number) => void
  handleDenyFriendship: (userId: number) => void
  setAcceptHandler: (handler: (userId: number) => void) => void
  setDenyHandler: (handler: (userId: number) => void) => void
}

const FriendshipContext = createContext<FriendshipContextType | undefined>(undefined)

export function FriendshipProvider({ children }: { children: ReactNode }) {
  const [pendingRequests, setPendingRequests] = useState<PendingFriendshipRequest[]>([])
  const [acceptHandler, setAcceptHandler] = useState<(userId: number) => void>(() => {})
  const [denyHandler, setDenyHandler] = useState<(userId: number) => void>(() => {})

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

  return (
    <FriendshipContext.Provider
      value={{
        pendingRequests,
        setPendingRequests,
        handleAcceptFriendship,
        handleDenyFriendship,
        setAcceptHandler,
        setDenyHandler,
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
