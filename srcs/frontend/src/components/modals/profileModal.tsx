"use client"

import { useEffect, useState } from "react"
import { useWebSocket } from "../../socketComponent"
import { user_url } from "@app/shared/api/service/common/endpoints"
import { useLanguage } from "../../i18n/LanguageContext"
import { useProfileModalStore } from "../../stores/uiStore"
import { useGlobalStore } from "../../features/global/store/globalStore"
import { getUserColorCSS } from "../../userColorUtils"
import { apiCall } from "@utils/useAPI"
import { UserAccountType } from "@app/shared/api/service/db/user";

export default function ProfileComponent() {
  const { t } = useLanguage()
  const { sendMessage } = useWebSocket()
  
  const { isOpen, targetUserId, closeProfileModal } = useProfileModalStore()
  
  const currentUserId = useGlobalStore(state => state.me.data.currentUserId);
  const onlineUsers = useGlobalStore(state => state.users.data.onlineUsers);
  
  const profile = useGlobalStore(state => 
    targetUserId ? state.users.data.userCache.get(targetUserId) : null
  )

  const [avatarBlobUrl, setAvatarBlobUrl] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && targetUserId) {
      sendMessage(user_url.ws.users.requestUserProfileData, targetUserId)
    }
  }, [isOpen, targetUserId, sendMessage])

  useEffect(() => {
    let active = true;

    async function fetchSecureAvatar() {
      const result = await apiCall(user_url.http.users.fetchUserAvatar, { params: { file: profile?.avatarUrl } })

      if (result.isErr()) {
        console.error("Failed to fetch avatar image securely.");
        return;
      }

      const payload = result.unwrap();

      switch (payload.code) {
        case 200:
          if (!active) return;
          processAvatarData(payload);
          break;
        default:
          console.error("Unexpected response code when fetching avatar:", payload.code);
      }



        const raw = await result.unwrap().payload.
        const base64 = raw.startsWith("data:") ? raw.split(",")[1]! : raw
        const binary = atob(base64)
        const len = binary.length
        const bytes = new Uint8Array(len)
        for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i)
        const blob = new Blob([bytes], { type: "image/png" })
        const objectUrl = URL.createObjectURL(blob)
        setAvatarBlobUrl(objectUrl)

    fetchSecureAvatar()

    return () => { 
      active = false
      if (avatarBlobUrl) URL.revokeObjectURL(avatarBlobUrl) 
    }
  }, [profile?.avatarUrl])

  const handleAddFriend = () => {
    if (targetUserId) sendMessage(user_url.ws.users.requestFriendship, targetUserId);
  }

  const handleStartDM = () => {
    if (targetUserId) {
        sendMessage(user_url.ws.chat.sendDirectMessage, { 
            targetUserId: targetUserId, 
            messageString: "👋" 
        });
        closeProfileModal();
    }
  }

  if (!isOpen || targetUserId === null) return null
  if (typeof document === 'undefined') return null

  const isOwnProfile = currentUserId === targetUserId
  const isUserOnline = profile?.onlineStatus === 1 || onlineUsers.has(targetUserId!);

  const displayName = profile?.alias || profile?.username || "Unknown";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={closeProfileModal}>
      <div
        className="bg-white/50 dark:bg-dark-800 shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col backdrop-blur-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {!profile ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="ml-3 text-gray-600 dark:text-gray-400">{t('profile.loadingProfile')}</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-700 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('profile.userProfile')}</h2>
              <button
                onClick={closeProfileModal}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto">
              
              {/* Profile Header Row */}
              <div className="flex items-start space-x-4">
                {/* Avatar */}
                <div className="relative h-20 w-20 flex-shrink-0 rounded-full overflow-hidden bg-gray-200 dark:bg-dark-700 border-2 border-white dark:border-gray-600 shadow-sm">
                  {avatarBlobUrl ? (
                    <img
                      src={avatarBlobUrl}
                      alt={profile.username}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-blue-500 text-white text-2xl font-bold">
                      {displayName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                
                {/* Names Column */}
                <div className="flex-1 min-w-0 pt-1">
                  {/* Big Display Name */}
                  <h3 
                    className="text-2xl font-bold leading-tight truncate" 
                    style={{ color: getUserColorCSS(profile.id, true) }}
                  >
                    {displayName}
                  </h3>
                  
                  {/* Small Real Username (Handle) */}
                  <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                    @{profile.username}
                  </div>
                  
                  {/* Status Pills */}
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${
                        isUserOnline
                          ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                        }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isUserOnline ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                      {isUserOnline ? 'Online' : 'Offline'}
                    </span>
                    
                    {profile.accountType === UserAccountType.Guest && (
                      <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200">
                        Guest
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Bio Section */}
              <div>
                <h4 className="text-sm font-semibold mb-2 text-gray-900 dark:text-white">{t('profile.bio')}</h4>
                <div className="bg-gray-50/50 dark:bg-black/20 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
                   <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap break-words">
                     {profile.bio || <span className="italic opacity-70">{t('profile.noBioYet')}</span>}
                   </p>
                </div>
              </div>

              {/* Actions */}
              {!isOwnProfile && (
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleAddFriend}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors shadow-sm font-medium"
                  >
                    {t('profile.addFriend')}
                  </button>
                  <button
                    onClick={handleStartDM}
                    className="flex-1 px-4 py-2 bg-white/50 dark:bg-dark-700 border border-gray-300 dark:border-dark-600 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-50/40 dark:hover:bg-dark-600 transition-colors font-medium"
                  >
                    {t('profile.sendMessage')}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}