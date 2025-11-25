"use client"

import React, { FC, useState, useCallback } from 'react'
import { getUserColorCSS } from './userColorUtils'
import { useFriendshipContext } from './friendshipContext'

interface FriendshipNotificationsProps {
  isLoading?: boolean
}

const FriendshipNotifications: FC<FriendshipNotificationsProps> = ({ isLoading = false }) => {
  const { pendingRequests, handleAcceptFriendship, handleDenyFriendship, setPendingRequests } = useFriendshipContext()
  const selfIdRef = React.useRef<number | null>(null)
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
  const [processingId, setProcessingId] = useState<number | null>(null)

  // Debug logging (can be removed in production)
  // React.useEffect(() => {
  //   console.log("[FriendshipNotifications] Pending requests:", pendingRequests)
  //   console.log("[FriendshipNotifications] Dropdown open:", isDropdownOpen)
  // }, [pendingRequests, isDropdownOpen])

  // For testing: add mock data on mount if no pending requests
  React.useEffect(() => {
    // To test with mock data, run in browser console:
    // localStorage.setItem('FRIENDSHIP_TEST_MODE', 'true'); location.reload()
    // Then to disable: localStorage.removeItem('FRIENDSHIP_TEST_MODE'); location.reload()
    const testMode = localStorage.getItem('FRIENDSHIP_TEST_MODE') === 'true'
    if (testMode) {
      console.log("[FriendshipNotifications] Setting mock data for testing...")
      const mockData = [
        { userId: 123, username: "alice", alias: "Alice Smith" },
        { userId: 456, username: "bob", alias: "Bob Johnson" },
      ]
      setPendingRequests(mockData)
    }
  }, [])

  const handleAccept = useCallback(
    async (userId: number) => {
      setProcessingId(userId)
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
      setProcessingId(userId)
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
        onClick={() => {
          setIsDropdownOpen(!isDropdownOpen)
        }}
        className="relative p-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        title="Friend requests"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* Red badge if there are pending requests */}
        {pendingRequests.length > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-500 rounded-full">
            {pendingRequests.length}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {isDropdownOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl dark:shadow-dark-700 z-50 border border-gray-200 dark:border-gray-700">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Friend Requests ({pendingRequests.length})
            </h3>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {pendingRequests.length > 0 ? (
              <div className="space-y-2 p-2">
                {pendingRequests.filter(req => req.userId !== selfIdRef.current).map((req) => (
                  <div
                    key={req.userId}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition"
                  >
                    <div className="flex-1 min-w-0 pr-3">
                      <p
                        className="text-sm font-bold truncate"
                        style={{ color: getUserColorCSS(req.userId, true) }}
                      >
                        {req.username}
                      </p>
                      {req.alias && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {req.alias}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAccept(req.userId)}
                        disabled={processingId === req.userId || isLoading}
                        className="px-3 py-1 text-xs font-medium bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleDeny(req.userId)}
                        disabled={processingId === req.userId || isLoading}
                        className="px-3 py-1 text-xs font-medium bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
                No pending friend requests
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default FriendshipNotifications
