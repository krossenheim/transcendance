import { useEffect, useState } from "react";
import { useLanguage } from "@src/i18n";
import { useGlobalStore } from "@features/global/store/globalStore";
import { UserFriendshipStatusEnum } from "@app/shared/api/service/db/friendship";
import { useUserConnectionsModalStore } from "./userConnectionsModalStore";
import { getUserColorCSS } from "@utils/users";
import { FriendType } from "@app/shared/api/service/db/user";

function FriendshipActionButtons({ user }: { user: FriendType }) {
    const { t } = useLanguage();

    const removeFriendship = useGlobalStore(state => state.users.actions.removeFriendship);
    const blockUser = useGlobalStore(state => state.users.actions.blockUser);

    return (
        <>
            <button
                onClick={() => removeFriendship(user.friendId)}
                className="px-3 py-1 text-xs font-medium bg-gray-500 text-white hover:bg-gray-600"
            >
                {t('friends.unfriend')}
            </button>
            <button
                onClick={() => blockUser(user.friendId)}
                className="px-3 py-1 text-xs font-medium bg-red-500 text-white hover:bg-red-600"
            >
                {t('friends.block')}
            </button>
        </>
    );
}

function PendingActionButtons({ user }: { user: FriendType }) {
    const { t } = useLanguage();

    const removeFriendship = useGlobalStore(state => state.users.actions.removeFriendship);

    return (
        <button
            onClick={() => removeFriendship(user.friendId)}
            className="px-3 py-1 text-xs font-medium bg-gray-500 text-white hover:bg-gray-600"
        >
            {t('friends.cancel')}
        </button>
    );
}

function BlockedActionButtons({ user }: { user: FriendType }) {
    const { t } = useLanguage();

    const unblockUser = useGlobalStore(state => state.users.actions.unblockUser);

    return (
        <button
            onClick={() => unblockUser(user.friendId)}
            className="px-3 py-1 text-xs font-medium bg-gray-100/40 dark:bg-dark-700 border border-gray-300 dark:border-dark-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50/40 dark:hover:bg-dark-600"
        >
            {t('friends.unblock')}
        </button>
    );
}

function ActionButtons({ user }: { user: FriendType }) {
    if (user.status === UserFriendshipStatusEnum.Accepted) {
        return <FriendshipActionButtons user={user} />;
    } else if (user.status === UserFriendshipStatusEnum.Pending) {
        return <PendingActionButtons user={user} />;
    } else if (user.status === UserFriendshipStatusEnum.Blocked) {
        return <BlockedActionButtons user={user} />;
    }

    return null;
}

export default function UserConnectionsModal() {
    const { t } = useLanguage();

    const [activeTab, setActiveTab] = useState(UserFriendshipStatusEnum.Accepted);
    const isOpen = useUserConnectionsModalStore(state => state.isOpen);
    const closeModal = useUserConnectionsModalStore(state => state.closeUserConnectionsModal);

    const fetchUserConnections = useGlobalStore(state => state.users.actions.fetchUserConnections);

    useEffect(() => {
        if (isOpen) {
            fetchUserConnections();
        }
    }, [isOpen, fetchUserConnections]);

    const userConnections = useGlobalStore(state => state.users.data.userRelationships);

    const userConnectionsArray = Array.from(userConnections.values());
    const connectionsToShow = userConnectionsArray.filter(c => c.status === activeTab);

    if (!isOpen) return null;

    return (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal()
          }}
        >
          <div className="w-full max-w-2xl glass-light-sm dark:glass-dark-sm glass-border shadow-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-dark-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('friends.friendsAndPrivacy')}</h2>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100/40 dark:hover:bg-dark-700">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
    
            <div className="px-4 pt-3">
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setActiveTab(UserFriendshipStatusEnum.Accepted)}
                  className={`px-3 py-1.5 text-sm ${activeTab === UserFriendshipStatusEnum.Accepted ? 'bg-blue-600 text-white' : 'bg-gray-100/40 dark:bg-dark-700 text-gray-700 dark:text-gray-200'}`}
                >
                  {t('friends.title')}
                </button>
                <button
                  onClick={() => setActiveTab(UserFriendshipStatusEnum.Pending)}
                  className={`px-3 py-1.5 text-sm ${activeTab === UserFriendshipStatusEnum.Pending ? 'bg-blue-600 text-white' : 'bg-gray-100/40 dark:bg-dark-700 text-gray-700 dark:text-gray-200'}`}
                >
                  {t('friends.requests')}
                </button>
                <button
                  onClick={() => setActiveTab(UserFriendshipStatusEnum.Blocked)}
                  className={`px-3 py-1.5 text-sm ${activeTab === UserFriendshipStatusEnum.Blocked ? 'bg-blue-600 text-white' : 'bg-gray-100/40 dark:bg-dark-700 text-gray-700 dark:text-gray-200'}`}
                >
                  {t('friends.blocked')}
                </button>
              </div>
            </div>
    
            <div className="px-4 pb-4 max-h-[60vh] overflow-y-auto">
                <div className="space-y-2">
                    {connectionsToShow.map((item) => {
                    const displayUserId = item.friendId
                    return (
                        <div key={`${item.id}-${item.status}`} className="flex items-center justify-between p-3 bg-gray-50/40 dark:bg-dark-700">
                        <div>
                            <div className="font-medium" style={{ color: getUserColorCSS(displayUserId, true) }}>{item.username}</div>
                                {item.alias && <div className="text-xs" style={{ color: getUserColorCSS(displayUserId, true), opacity: 0.8 }}>{item.alias}</div>}
                            </div>
                            <ActionButtons user={item} />
                        </div>
                    )
                    })}
                    {(activeTab === UserFriendshipStatusEnum.Accepted && connectionsToShow.length === 0) && (
                    <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">{t('friends.noFriendsYet')}</div>
                    )}
                    {(activeTab === UserFriendshipStatusEnum.Pending && connectionsToShow.length === 0) && (
                    <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">{t('friends.noPendingRequests')}</div>
                    )}
                    {(activeTab === UserFriendshipStatusEnum.Blocked && connectionsToShow.length === 0) && (
                    <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">{t('friends.noBlockedUsers')}</div>
                    )}
                </div>
            </div>
          </div>
        </div>
    );
}
