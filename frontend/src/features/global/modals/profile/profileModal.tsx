"use client"

import { getUserColorCSS, getVisualUserName, getPlayerInitials } from "@utils/users";
import { user_url } from "@app/shared/api/service/common/endpoints";
import { UserAccountType } from "@app/shared/api/service/db/user";
import type { MatchHistoryEntryType } from "@app/shared/api/service/db/gameResult";
import { useProfileModalStore } from "./profileModalStore";
import { useWebSocket } from "../../../../socketComponent";
import { HandlerResult } from "../../../../socketComponent";
import { useGlobalStore } from "../../store/globalStore";
import { useLanguage } from "@language/LanguageContext";
import { useEffect, useState } from "react";

function UserStatusPill({ isOnline }: { isOnline: boolean }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${isOnline
        ? "bg-green-900/40 text-green-200 border border-green-800"
        : "bg-gray-700/50 text-gray-400 border border-gray-600"
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
        <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-orange-900/40 text-orange-200 border border-orange-800">
          Guest
        </span>
      );
    default:
      return null;
  }
}

export default function ProfileComponent() {
  const { t } = useLanguage()
  const { sendMessage, subscribe } = useWebSocket()

  const { isOpen, targetUserId, closeProfileModal } = useProfileModalStore()

  const currentUserId = useGlobalStore(state => state.me.data.currentUserId);
  const onlineUsers = useGlobalStore(state => state.users.data.onlineUsers);
  const currentUserFriends = useGlobalStore(state => state.users.data.friends);
  const userAvatarFetcher = useGlobalStore(state => state.users.actions.fetchUserProfileUrl);

  const profile = useGlobalStore(state =>
    targetUserId ? state.users.data.userCache.get(targetUserId) : null
  )

  const [avatarBlobUrl, setAvatarBlobUrl] = useState < string | null > (null)
  const [matchHistory, setMatchHistory] = useState<MatchHistoryEntryType[]>([])
  const [matchHistoryLoading, setMatchHistoryLoading] = useState(false)

  useEffect(() => {
    if (isOpen && targetUserId) {
      sendMessage(user_url.ws.users.requestUserProfileData, targetUserId)
      setMatchHistory([])
      setMatchHistoryLoading(true)
      sendMessage(user_url.ws.users.fetchUserMatchHistory, targetUserId)
    }
  }, [isOpen, targetUserId, sendMessage])

  useEffect(() => {
    const unsub = subscribe(user_url.ws.users.fetchUserMatchHistory, (payload, schema) => {
      if (payload.code === schema.output.Success.code) {
        setMatchHistory(payload.payload as MatchHistoryEntryType[])
        setMatchHistoryLoading(false)
        return HandlerResult.Handled
      }
      if (payload.code === schema.output.Failure.code) {
        setMatchHistoryLoading(false)
        return HandlerResult.Handled
      }
      return HandlerResult.NotHandled
    })
    return unsub
  }, [subscribe])

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

  const formatWinPercentage = (percentage: number | undefined) => {
    if (percentage === undefined || percentage === null) return "0%";
    return `${Math.round(percentage)}%`;
  }

  const cardClasses = isFriend
    ? 'bg-blue-900/10 border-blue-900/30'
    : 'bg-black/20 border-gray-700';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={closeProfileModal}>
      <div
        className={`bg-white/90 bg-dark-800/90 shadow-2xl max-w-md w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col backdrop-blur-md rounded-xl transition-all ${
          isFriend ? 'ring-2 ring-blue-500/40 shadow-blue-500/10' : 'border border-dark-700'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {!profile ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="ml-3 text-gray-400">{t('profile.loadingProfile')}</p>
          </div>
        ) : (
          <>
            {}
            <div className={`px-6 py-4 border-b flex justify-between items-center ${isFriend ? 'border-blue-500/20 bg-blue-900/10' : 'border-dark-700'}`}>
              <h2 className="text-xl font-semibold text-white">{t('profile.userProfile')}</h2>
              <button
                onClick={closeProfileModal}
                className="text-gray-500 hover:text-gray-300 transition-colors text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto">

              <div className="flex items-start space-x-4">
                {}
                <div className={`relative h-20 w-20 flex-shrink-0 rounded-full overflow-hidden bg-dark-700 border-4 shadow-sm transition-colors ${
                  isFriend ? 'border-blue-500' : 'border-gray-600'
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
                    style={{ color: getUserColorCSS(profile.id) }}
                  >
                    {displayName}
                    {isFriend && (
                      <svg className="w-5 h-5 text-blue-500 drop-shadow-sm" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    )}
                  </h3>

                  <div className="text-sm text-gray-400 font-medium">
                    @{profile.username}
                  </div>

                  {}
                  <div className="flex flex-wrap gap-2 mt-2">
                    <UserStatusPill isOnline={isUserOnline} />
                    <UserAccountTypePill accountType={profile.accountType} />

                    {isFriend && (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-blue-900/40 text-blue-300 border border-blue-800">
                        Friend
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {}
              <div>
                <h4 className="text-sm font-semibold mb-2 text-white">{t('profile.bio') || 'Bio'}</h4>
                <div className={`p-3 rounded-lg border ${cardClasses}`}>
                   <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">
                     {profile.bio || <span className="italic opacity-70">{t('profile.noBioYet') || 'No bio yet.'}</span>}
                   </p>
                </div>
              </div>

              {}
              {profile.gameResults && profile.accountType !== UserAccountType.System && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-white">{t('profile.statistics') || 'Game Stats'}</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className={`p-3 rounded-lg border text-center flex flex-col justify-center ${cardClasses}`}>
                      <span className="text-xl font-bold text-white leading-none">
                        {profile.gameResults.total_games_played ?? 0}
                      </span>
                      <span className="text-[10px] font-semibold text-gray-400 mt-1.5 uppercase tracking-wider">
                        {t('profile.gamesPlayed')}
                      </span>
                    </div>

                    <div className={`p-3 rounded-lg border text-center flex flex-col justify-center ${cardClasses}`}>
                      <span className="text-xl font-bold text-green-400 leading-none">
                        {profile.gameResults.wins ?? 0}
                      </span>
                      <span className="text-[10px] font-semibold text-gray-400 mt-1.5 uppercase tracking-wider">
                        {t('profile.wins')}
                      </span>
                    </div>

                    <div className={`p-3 rounded-lg border text-center flex flex-col justify-center ${cardClasses}`}>
                      <span className="text-xl font-bold text-blue-400 leading-none">
                        {formatWinPercentage(profile.gameResults.win_rate)}
                      </span>
                      <span className="text-[10px] font-semibold text-gray-400 mt-1.5 uppercase tracking-wider">
                        {t('profile.winRate')}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {}
              {profile.accountType !== UserAccountType.System && (
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-white">
                    {t('profile.matchHistory') || 'Match History'}
                  </h4>
                  {matchHistoryLoading ? (
                    <div className={`p-4 rounded-lg border text-center ${cardClasses}`}>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mx-auto"></div>
                    </div>
                  ) : matchHistory.length === 0 ? (
                    <div className={`p-4 rounded-lg border text-center ${cardClasses}`}>
                      <p className="text-sm text-gray-400 italic">
                        {t('profile.recentMatches') ? 'No matches yet' : 'No matches yet'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {matchHistory.slice(0, 10).map((match) => {
                        const isWin = match.rank === 1
                        const dateStr = new Date(match.createdAt * 1000).toLocaleDateString(undefined, {
                          month: 'short', day: 'numeric', year: 'numeric'
                        })
                        return (
                          <div
                            key={match.gameId}
                            className={`p-3 rounded-lg border flex items-center justify-between ${cardClasses}`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold uppercase rounded ${
                                isWin
                                  ? 'bg-green-900/40 text-green-300'
                                  : 'bg-red-900/40 text-red-300'
                              }`}>
                                {isWin ? (t('profile.win') || 'Win') : (t('profile.loss') || 'Loss')}
                              </span>
                              <div className="text-sm text-gray-300 truncate">
                                {match.opponents.length === 0
                                  ? <span className="font-medium italic">AI</span>
                                  : match.opponents.map((opp, i) => (
                                    <span key={opp.userId}>
                                      {i > 0 && ', '}
                                      <span className="font-medium">{opp.alias || opp.username}</span>
                                    </span>
                                  ))
                                }
                              </div>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                              <span className="text-sm font-bold text-white">
                                {match.score}
                                {match.opponents.length > 0 && (
                                  <>
                                    <span className="text-gray-500 font-normal mx-0.5">-</span>
                                    {match.opponents.length === 1
                                      ? match.opponents[0]!.score
                                      : match.opponents.map(o => o.score).join('/')}
                                  </>
                                )}
                              </span>
                              <span className="text-[10px] text-gray-500 whitespace-nowrap">
                                {dateStr}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {}
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
                    className="flex-1 px-4 py-2 bg-dark-700 border border-dark-600 text-gray-200 rounded-md hover:bg-dark-600 transition-colors font-medium"
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

