import { FriendType, PublicUserDataType } from "@app/shared/api/service/db/user";


export interface GlobalUserData {
    userCache: Map<number, PublicUserDataType>;
    onlineUsers: Set<number>;
    friends: Set<number>;
    blockedUsers: Set<number>;
    userRelationships: Map<number, FriendType>;
}

export interface GlobalUserActions {
    fetchPublicUserData: (userId: number) => void;
    blockUser: (userId: number) => void;
    sendFriendRequest: (userId: number) => void;
    acceptFriendRequest: (userId: number) => void;
    denyFriendRequest: (userId: number) => void;
}

export interface GlobalUserStates {
    cachePublicUserData: (userData: PublicUserDataType | PublicUserDataType[]) => void;
    addOnlineUsers: (userIds: number[]) => void;
    removeOnlineUsers: (userIds: number[]) => void;
    setUserRelationships: (relationships: FriendType[]) => void;
    addFriend: (userId: number) => void;
    blockUser: (userId: number) => void;
}

export interface GlobalUserSlice {
    users: {
        data: GlobalUserData;
        actions: GlobalUserActions;
        state: GlobalUserStates;
    };
};
