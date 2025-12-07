"use client"

import React, { FC, useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { getUserColorCSS } from './userColorUtils'
import { useFriendshipContext } from './friendshipContext'

// Notification types
type NotificationType = 'friend_request' | 'chat_invite' | 'dm_invite'

interface Notification {
  id: string
  type: NotificationType
  userId: number
  username: string
  alias?: string
  roomId?: number
  roomName?: string
  timestamp: number
}

interface FriendshipNotificationsProps {
  isLoading?: boolean
}

const FriendshipNotifications: FC<FriendshipNotificationsProps> = ({ 
  isLoading = false,
}) => {
  const { 
    pendingRequests, 
    handleAcceptFriendship, 
    handleDenyFriendship, 
    roomInvites,
    handleAcceptRoomInvite,
    handleDeclineRoomInvite,
    dmInvites,
    handleAcceptDmInvite,
    handleDeclineDmInvite
  } = useFriendshipContext()
  const selfIdRef = React.useRef<number | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    try {
      const jwt = localStorage.getItem('jwt')
      if (jwt) {
        const payload = JSON.parse(atob(jwt.split('.')[1]))
        if (typeof payload.uid === 'number') selfIdRef.current = payload.uid
      }
    } catch {}
  }, [])

  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 })

  // Calculate total notification count
  const totalNotifications = pendingRequests.length + roomInvites.length + dmInvites.length

  React.useEffect(() => {
    if (isDropdownOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setDropdownPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right
      })
    }
  }, [isDropdownOpen])

  useEffect(() => {
    if (!isDropdownOpen) return

    function handleClickOutside(e: MouseEvent) {
      const dropdownEl = dropdownRef.current
      const buttonEl = buttonRef.current

      if (buttonEl && buttonEl.contains(e.target as Node)) return
      if (dropdownEl && dropdownEl.contains(e.target as Node)) return

      setIsDropdownOpen(false)
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isDropdownOpen])

  const handleAccept = useCallback(
    async (userId: number) => {
      setProcessingId(`friend_${userId}`)
      try {
        await handleAcceptFriendship(userId)
      } finally {
        setProcessingId(null)
      }
    },
    [handleAcceptFriendship],
  )

  const handleDeny = useCallback(
    async (userId: number) => {
      setProcessingId(`friend_${userId}`)
      try {
        await handleDenyFriendship(userId)
      } finally {
        setProcessingId(null)
      }
    },
    [handleDenyFriendship],
  )

  return (
    <div className="relative">
      {/* Bell icon button */}
      <button
        ref={buttonRef}
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="relative p-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100/40 dark:hover:bg-gray-700 transition-colors"
        title="Notifications"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {totalNotifications > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold text-white transform translate-x-1/2 -translate-y-1/2 bg-red-500 rounded-full">
            {totalNotifications}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {isDropdownOpen && createPortal(
        <div
          ref={dropdownRef}
          className="fixed w-80 glass-light-sm dark:glass-dark-sm glass-border shadow-xl dark:shadow-dark-700 z-[9999]"
          style={{ top: `${dropdownPosition.top}px`, right: `${dropdownPosition.right}px` }}
        >
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900">
              Notifications ({totalNotifications})
            </h3>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {totalNotifications > 0 ? (
              <div className="space-y-2 p-2">
                {/* Friend Requests Section */}
                {pendingRequests.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-xs font-semibold text-gray-900 uppercase tracking-wide">
                      👥 Friend Requests
                    </div>
                    {pendingRequests.filter(req => req.userId !== selfIdRef.current).map((req) => (
                      <div
                        key={`friend_${req.userId}`}
                        className="flex items-center justify-between p-3 bg-gray-50/40 dark:bg-gray-700/80 rounded-lg hover:bg-gray-100/40 dark:hover:bg-gray-600/80 transition"
                      >
                        <div className="flex-1 min-w-0 pr-3">
                          <p
                            className="text-sm font-bold truncate"
                            style={{ color: getUserColorCSS(req.userId, true) }}
                          >
                            {req.username}
                          </p>
                          {req.alias && (
                            <p className="text-xs text-gray-600 truncate">
                              {req.alias}
                            </p>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAccept(req.userId)}
                            disabled={processingId === `friend_${req.userId}` || isLoading}
                            className="px-3 py-1 text-xs font-medium bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleDeny(req.userId)}
                            disabled={processingId === `friend_${req.userId}` || isLoading}
                            className="px-3 py-1 text-xs font-medium bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                          >
                            Deny
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* Chat Room Invites Section */}
                {roomInvites.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-xs font-semibold text-gray-900 uppercase tracking-wide mt-2">
                      💬 Chat Room Invites
                    </div>
                    {roomInvites.map((invite) => (
                      <div
                        key={`chat_${invite.roomId}`}
                        className="flex items-center justify-between p-3 bg-blue-50/40 dark:bg-blue-900/30 rounded-lg hover:bg-blue-100/40 dark:hover:bg-blue-800/40 transition"
                      >
                        <div className="flex-1 min-w-0 pr-3">
                          <p className="text-sm font-bold text-gray-900 truncate">
                            {invite.roomName}
                          </p>
                          <p className="text-xs text-gray-600 truncate">
                            Invited by {invite.inviterUsername}
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAcceptRoomInvite(invite.roomId)}
                            disabled={processingId === `chat_${invite.roomId}` || isLoading}
                            className="px-3 py-1 text-xs font-medium bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                          >
                            Join
                          </button>
                          <button
                            onClick={() => handleDeclineRoomInvite(invite.roomId)}
                            disabled={processingId === `chat_${invite.roomId}` || isLoading}
                            className="px-3 py-1 text-xs font-medium bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* Direct Message Invites Section */}
                {dmInvites.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-xs font-semibold text-gray-900 uppercase tracking-wide mt-2">
                      ✉️ Direct Messages
                    </div>
                    {dmInvites.map((invite) => (
                      <div
                        key={`dm_${invite.roomId}`}
                        className="flex items-center justify-between p-3 bg-purple-50/40 dark:bg-purple-900/30 rounded-lg hover:bg-purple-100/40 dark:hover:bg-purple-800/40 transition"
                      >
                        <div className="flex-1 min-w-0 pr-3">
                          <p
                            className="text-sm font-bold truncate"
                            style={{ color: getUserColorCSS(invite.oderId, true) }}
                          >
                            {invite.username}
                          </p>
                          <p className="text-xs text-gray-600 truncate">
                            wants to message you
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAcceptDmInvite(invite.roomId)}
                            disabled={processingId === `dm_${invite.roomId}` || isLoading}
                            className="px-3 py-1 text-xs font-medium bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                          >
                            Open
                          </button>
                          <button
                            onClick={() => handleDeclineDmInvite(invite.roomId)}
                            disabled={processingId === `dm_${invite.roomId}` || isLoading}
                            className="px-3 py-1 text-xs font-medium bg-gray-500 text-white rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-gray-600">
                No notifications
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

export default FriendshipNotifications
