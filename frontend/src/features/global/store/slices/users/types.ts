import type { UserNotificationsType } from "@app/shared/api/service/db/notification";
import { FriendType, PublicUserDataType } from "@app/shared/api/service/db/user";
import { Result } from "@app/shared/api/service/common/result";

export interface GlobalUserData {
    userCache: Map<number, PublicUserDataType>;
    onlineUsers: Set<number>;
    friends: Set<number>;
    blockedUsers: Set<number>;
    userRelationships: Map<number, FriendType>;
    notifications: UserNotificationsType;
}

export interface GlobalUserActions {
    fetchPublicUserData: (userId: number) => void;
    blockUser: (userId: number) => void;
    sendFriendRequest: (userId: number) => void;
    acceptFriendRequest: (userId: number) => void;
    denyFriendRequest: (userId: number) => void;
    acceptRoomInvite: (roomId: number) => void;
    fetchUserProfileUrl: (url: string) => Promise<Result<string, string>>;
    fetchUserConnections: () => void;
    removeFriendship: (userId: number) => void;
    unblockUser: (userId: number) => void;
}

export interface GlobalUserStates {
    cachePublicUserData: (userData: PublicUserDataType | PublicUserDataType[]) => void;
    addOnlineUsers: (userIds: number[]) => void;
    removeOnlineUsers: (userIds: number[]) => void;
    setUserRelationships: (relationships: FriendType[]) => void;
    addFriend: (userId: number) => void;
    blockUser: (userId: number) => void;
    updateUserNotifications: (notifications: UserNotificationsType) => void;
}

export interface GlobalUserSlice {
    users: {
        data: GlobalUserData;
        actions: GlobalUserActions;
        state: GlobalUserStates;
    };
};

