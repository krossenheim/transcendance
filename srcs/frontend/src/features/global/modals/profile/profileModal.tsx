"use client"

import { getUserColorCSS, getVisualUserName, getPlayerInitials } from "@utils/users";
import { user_url } from "@app/shared/api/service/common/endpoints";
import { UserAccountType } from "@app/shared/api/service/db/user";
import { useProfileModalStore } from "./profileModalStore";
import { useWebSocket } from "../../../../socketComponent";
import { useGlobalStore } from "../../store/globalStore";
import { useLanguage } from "@language/LanguageContext";
import { useEffect, useState } from "react";

function UserStatusPill({ isOnline }: { isOnline: boolean }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${isOnline
        ? "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800"
        : "bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600"
        }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`}></span>
      {isOnline ? 'Online' : 'Offline'}
    </span>
  )
}

function UserAccountTypePill({ accountType }: { accountType: UserAccountType }) {
  switch (accountType) {
    case UserAccountType.Guest:
      return (
        <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200 border border-orange-200 dark:border-orange-800">
          Guest
        </span>
      );
    default:
      return null;
  }
}

export default function ProfileComponent() {
  const { t } = useLanguage()
  const { sendMessage } = useWebSocket()

  const { isOpen, targetUserId, closeProfileModal } = useProfileModalStore()

  const currentUserId = useGlobalStore(state => state.me.data.currentUserId);
  const onlineUsers = useGlobalStore(state => state.users.data.onlineUsers);
  const currentUserFriends = useGlobalStore(state => state.users.data.friends);
  const userAvatarFetcher = useGlobalStore(state => state.users.actions.fetchUserProfileUrl);

  const profile = useGlobalStore(state =>
    targetUserId ? state.users.data.userCache.get(targetUserId) : null
  )

  const [avatarBlobUrl, setAvatarBlobUrl] = useState < string | null > (null)

  useEffect(() => {
    if (isOpen && targetUserId) {
      sendMessage(user_url.ws.users.requestUserProfileData, targetUserId)
    }
  }, [isOpen, targetUserId, sendMessage])

  useEffect(() => {
    if (profile?.avatarUrl) {
      userAvatarFetcher(profile.avatarUrl).then(result => {
        if (result.isOk()) {
          setAvatarBlobUrl(result.unwrap());
        } else {
          setAvatarBlobUrl(null);
        }
      });
    } else {
      setAvatarBlobUrl(null);
    }
  }, [profile?.avatarUrl])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeProfileModal();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeProfileModal]);

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

  if (!isOpen || targetUserId === null) return null;
  if (typeof document === 'undefined') return null;

  const isUserOnline = onlineUsers.has(targetUserId) || profile?.accountType === UserAccountType.System;
  const isOwnProfile = currentUserId === targetUserId;

  const displayName = getVisualUserName(profile, targetUserId);
  const isFriend = currentUserFriends.has(targetUserId ?? -1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={closeProfileModal}>
      <div
        className={`bg-white/90 dark:bg-dark-800/90 shadow-2xl max-w-md w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col backdrop-blur-md rounded-xl transition-all ${isFriend ? 'ring-2 ring-blue-500/40 shadow-blue-500/10' : 'border border-gray-200 dark:border-dark-700'
          }`}
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
            <div className={`px-6 py-4 border-b flex justify-between items-center ${isFriend ? 'border-blue-500/20 bg-blue-50/50 dark:bg-blue-900/10' : 'border-gray-200 dark:border-dark-700'}`}>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('profile.userProfile')}</h2>
              <button
                onClick={closeProfileModal}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto">

              <div className="flex items-start space-x-4">
                {/* Avatar */}
                <div className={`relative h-20 w-20 flex-shrink-0 rounded-full overflow-hidden bg-gray-200 dark:bg-dark-700 border-4 shadow-sm transition-colors ${isFriend ? 'border-blue-400 dark:border-blue-500' : 'border-white dark:border-gray-600'
                  }`}>
                  {avatarBlobUrl ? (
                    <img
                      src={avatarBlobUrl}
                      alt={displayName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-blue-500 text-white text-2xl font-bold">
                      {getPlayerInitials(profile, targetUserId)}
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0 pt-1">
                  <h3
                    className="text-2xl font-bold leading-tight truncate flex items-center gap-2"
                    style={{ color: getUserColorCSS(profile.id, true) }}
                  >
                    {displayName}
                    {isFriend && (
                      <svg className="w-5 h-5 text-blue-500 drop-shadow-sm" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    )}
                  </h3>

                  <div className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                    @{profile.username}
                  </div>

                  {/* Status Pills */}
                  <div className="flex flex-wrap gap-2 mt-2">
                    <UserStatusPill isOnline={isUserOnline} />
                    <UserAccountTypePill accountType={profile.accountType} />

                    {isFriend && (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        Friend
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Bio Section */}
              <div>
                <h4 className="text-sm font-semibold mb-2 text-gray-900 dark:text-white">{t('profile.bio')}</h4>
                <div className={`p-3 rounded-lg border ${isFriend
                  ? 'bg-blue-50/30 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/30'
                  : 'bg-gray-50/50 dark:bg-black/20 border-gray-100 dark:border-gray-700'
                  }`}>
                  <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap break-words">
                    {profile.bio || <span className="italic opacity-70">{t('profile.noBioYet')}</span>}
                  </p>
                </div>
              </div>

              {/* Actions */}
              {!isOwnProfile && profile.accountType != UserAccountType.System && (
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

