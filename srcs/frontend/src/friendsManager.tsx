"use client"

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useWebSocket } from './socketComponent'
import { user_url } from '@app/shared/api/service/common/endpoints'
import { getUserColorCSS } from './userColorUtils'

interface FriendsManagerProps {
  isOpen: boolean
  onClose: () => void
}

interface ConnectionItem {
  id: number
  friendId: number
  username: string
  alias?: string | null
  status: number // 0=None, 1=Pending, 2=Accepted, 3=Blocked
  onlineStatus?: number
}

const TABS = ["Friends", "Requests", "Blocked"] as const

type Tab = typeof TABS[number]

export default function FriendsManager({ isOpen, onClose }: FriendsManagerProps) {
  const { sendMessage, payloadReceived } = useWebSocket()
  const [activeTab, setActiveTab] = useState<Tab>('Friends')
  const [connections, setConnections] = useState<ConnectionItem[]>([])
  const [loading, setLoading] = useState(false)

  // Get current user ID from JWT
  const [selfUserId, setSelfUserId] = React.useState<number | null>(null)
  React.useEffect(() => {
    try {
      const jwt = localStorage.getItem('jwt')
      if (jwt) {
        const payload = JSON.parse(atob(jwt.split('.')[1]!))
        if (typeof payload.uid === 'number') setSelfUserId(payload.uid)
      }
    } catch { }
  }, [])

  const sendToSocket = useCallback((funcId: string, payload: any) => {
    const toSend = { funcId, payload, target_container: 'users' }
    sendMessage(toSend)
  }, [sendMessage])

  // Fetch connections when opened
  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    sendToSocket(user_url.ws.users.fetchUserConnections.funcId, null)
    const timeout = setTimeout(() => setLoading(false), 2000)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  useEffect(() => {
    if (!payloadReceived) return
    if (payloadReceived.funcId === user_url.ws.users.fetchUserConnections.funcId) {
      const list = Array.isArray(payloadReceived.payload) ? payloadReceived.payload : []
      setConnections(list as ConnectionItem[])
      setLoading(false)
    }
    if (
      payloadReceived.funcId === user_url.ws.users.blockUser.funcId ||
      payloadReceived.funcId === user_url.ws.users.unblockUser.funcId ||
      payloadReceived.funcId === user_url.ws.users.confirmFriendship.funcId ||
      payloadReceived.funcId === user_url.ws.users.denyFriendship.funcId ||
      payloadReceived.funcId === user_url.ws.users.removeFriendship.funcId
    ) {
      // Refresh list after action completes
      setTimeout(() => sendToSocket(user_url.ws.users.fetchUserConnections.funcId, null), 200)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadReceived])

  const friends = useMemo(() => connections.filter(c => c.status === 2), [connections])
  const blocked = useMemo(() => connections.filter(c => c.status === 3), [connections])
  const pending = useMemo(() => connections.filter(c => c.status === 1), [connections])

  const ActionButtons: React.FC<{ item: ConnectionItem }> = ({ item }) => {
    return (
      <div className="flex gap-2">
        {item.status === 1 && (
          <>
            <button
              onClick={() => sendToSocket(user_url.ws.users.confirmFriendship.funcId, item.id)}
              className="px-3 py-1 text-xs font-medium bg-green-500 text-white hover:bg-green-600"
            >
              Accept
            </button>
            <button
              onClick={() => sendToSocket(user_url.ws.users.denyFriendship.funcId, item.id)}
              className="px-3 py-1 text-xs font-medium bg-red-500 text-white hover:bg-red-600"
            >
              Deny
            </button>
          </>
        )}
        {item.status === 2 && (
          <>
            <button
              onClick={() => sendToSocket(user_url.ws.users.removeFriendship.funcId, item.friendId)}
              className="px-3 py-1 text-xs font-medium bg-gray-500 text-white hover:bg-gray-600"
            >
              Unfriend
            </button>
            <button
              onClick={() => sendToSocket(user_url.ws.users.blockUser.funcId, item.friendId)}
              className="px-3 py-1 text-xs font-medium bg-red-500 text-white hover:bg-red-600"
            >
              Block
            </button>
          </>
        )}
        {item.status === 3 && (
          <button
            onClick={() => sendToSocket(user_url.ws.users.unblockUser.funcId, item.friendId)}
            className="px-3 py-1 text-xs font-medium bg-gray-100/40 dark:bg-dark-700 border border-gray-300 dark:border-dark-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50/40 dark:hover:bg-dark-600"
          >
            Unblock
          </button>
        )}
      </div>
    )
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
      onClick={(e) => {
        // If the user clicks the overlay (not the modal content), close the modal
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-2xl glass-light-sm dark:glass-dark-sm glass-border shadow-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-dark-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Friends & Privacy</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100/40 dark:hover:bg-dark-700">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-4 pt-3">
          <div className="flex gap-2 mb-3">
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 text-sm ${activeTab === tab ? 'bg-blue-600 text-white' : 'bg-gray-100/40 dark:bg-dark-700 text-gray-700 dark:text-gray-200'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 pb-4 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center text-gray-500 dark:text-gray-400">Loading...</div>
          ) : (
            <div className="space-y-2">
              {(activeTab === 'Friends' ? friends : activeTab === 'Blocked' ? blocked : pending).map((item) => {
                // Determine the correct user ID for coloring: use id if friendId matches self, otherwise use friendId
                const displayUserId = (selfUserId !== null && item.friendId === selfUserId) ? item.id : item.friendId
                return (
                  <div key={`${item.id}-${item.status}`} className="flex items-center justify-between p-3 bg-gray-50/40 dark:bg-dark-700">
                    <div>
                      <div className="font-medium" style={{ color: getUserColorCSS(displayUserId, true) }}>{item.username}</div>
                      {item.alias && <div className="text-xs" style={{ color: getUserColorCSS(displayUserId, true), opacity: 0.8 }}>{item.alias}</div>}
                    </div>
                    <ActionButtons item={item} />
                  </div>
                )
              })}
              {(activeTab === 'Friends' && friends.length === 0) && (
                <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">No friends yet</div>
              )}
              {(activeTab === 'Requests' && pending.length === 0) && (
                <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">No pending requests</div>
              )}
              {(activeTab === 'Blocked' && blocked.length === 0) && (
                <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">No blocked users</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
