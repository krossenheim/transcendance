"use client"

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useWebSocket } from './socketComponent'
import { user_url } from '@app/shared/api/service/common/endpoints'
import { getUserColorCSS } from './userColorUtils'
import { useLanguage } from './i18n'

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

type Tab = 'friends' | 'requests' | 'blocked'

export default function FriendsManager({ isOpen, onClose }: FriendsManagerProps) {
  const { t } = useLanguage()
  const { sendMessage, payloadReceived } = useWebSocket()
  const [activeTab, setActiveTab] = useState<Tab>('friends')
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


  // Fetch connections when opened
  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    sendMessage(user_url.ws.users.fetchUserConnections, null)
    const timeout = setTimeout(() => setLoading(false), 2000)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  useEffect(() => {
    if (!payloadReceived) return
    if (payloadReceived.funcId === user_url.ws.users.fetchUserConnections.funcId) {
      console.log("Received fetchUserConnections:", payloadReceived.payload)
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
      console.log("Received action response:", payloadReceived.funcId)
      // Refresh list after action completes
      setTimeout(() => sendMessage(user_url.ws.users.fetchUserConnections, null), 200)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadReceived])

  const friends = useMemo(() => connections.filter(c => c.status === 2), [connections])
  const blocked = useMemo(() => {
    const b = connections.filter(c => c.status === 3)
    console.log("Blocked connections:", b)
    return b
  }, [connections])
  const pending = useMemo(() => connections.filter(c => c.status === 1), [connections])

  const ActionButtons: React.FC<{ item: ConnectionItem }> = ({ item }) => {
    return (
      <div className="flex gap-2">
        {item.status === 1 && (
          <>
            {selfUserId !== null && item.friendId === selfUserId ? (
              <>
                <button
                  onClick={() => sendMessage(user_url.ws.users.confirmFriendship, item.id)}
                  className="px-3 py-1 text-xs font-medium bg-green-500 text-white hover:bg-green-600"
                >
                  {t('friends.accept')}
                </button>
                <button
                  onClick={() => sendMessage(user_url.ws.users.denyFriendship, item.id)}
                  className="px-3 py-1 text-xs font-medium bg-red-500 text-white hover:bg-red-600"
                >
                  {t('friends.deny')}
                </button>
              </>
            ) : (
              <>
                <span className="px-3 py-1 text-xs font-medium bg-yellow-400 text-white">{t('friends.pending')}</span>
                <button
                  onClick={() => sendMessage(user_url.ws.users.removeFriendship, item.friendId)}
                  className="px-3 py-1 text-xs font-medium bg-gray-500 text-white hover:bg-gray-600"
                >
                  {t('friends.cancel')}
                </button>
              </>
            )}
          </>
        )}
        {item.status === 2 && (
          <>
            <button
              onClick={() => sendMessage(user_url.ws.users.removeFriendship, item.friendId)}
              className="px-3 py-1 text-xs font-medium bg-gray-500 text-white hover:bg-gray-600"
            >
              {t('friends.unfriend')}
            </button>
            <button
              onClick={() => sendMessage(user_url.ws.users.blockUser, item.friendId)}
              className="px-3 py-1 text-xs font-medium bg-red-500 text-white hover:bg-red-600"
              disabled={item.friendId === selfUserId || item.friendId === 1}
            >
              {t('friends.block')}
            </button>
          </>
        )}
        {item.status === 3 && (
          <button
            onClick={() => sendMessage(user_url.ws.users.unblockUser, item.friendId)}
            className="px-3 py-1 text-xs font-medium bg-gray-100/40 dark:bg-dark-700 border border-gray-300 dark:border-dark-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50/40 dark:hover:bg-dark-600"
          >
            {t('friends.unblock')}
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
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('friends.friendsAndPrivacy')}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100/40 dark:hover:bg-dark-700">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-4 pt-3">
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setActiveTab('friends')}
              className={`px-3 py-1.5 text-sm ${activeTab === 'friends' ? 'bg-blue-600 text-white' : 'bg-gray-100/40 dark:bg-dark-700 text-gray-700 dark:text-gray-200'}`}
            >
              {t('friends.title')}
            </button>
            <button
              onClick={() => setActiveTab('requests')}
              className={`px-3 py-1.5 text-sm ${activeTab === 'requests' ? 'bg-blue-600 text-white' : 'bg-gray-100/40 dark:bg-dark-700 text-gray-700 dark:text-gray-200'}`}
            >
              {t('friends.requests')}
            </button>
            <button
              onClick={() => setActiveTab('blocked')}
              className={`px-3 py-1.5 text-sm ${activeTab === 'blocked' ? 'bg-blue-600 text-white' : 'bg-gray-100/40 dark:bg-dark-700 text-gray-700 dark:text-gray-200'}`}
            >
              {t('friends.blocked')}
            </button>
          </div>
        </div>

        <div className="px-4 pb-4 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center text-gray-500 dark:text-gray-400">{t('common.loading')}</div>
          ) : (
            <div className="space-y-2">
              {(activeTab === 'friends' ? friends : activeTab === 'blocked' ? blocked : pending).map((item) => {
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
              {(activeTab === 'friends' && friends.length === 0) && (
                <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">{t('friends.noFriendsYet')}</div>
              )}
              {(activeTab === 'requests' && pending.length === 0) && (
                <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">{t('friends.noPendingRequests')}</div>
              )}
              {(activeTab === 'blocked' && blocked.length === 0) && (
                <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">{t('friends.noBlockedUsers')}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
