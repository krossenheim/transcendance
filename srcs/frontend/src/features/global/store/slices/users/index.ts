import { PublicUserDataType, FriendType } from "@app/shared/api/service/db/user";
import { user_url } from "@app/shared/api/service/common/endpoints";
import { getSocketSenderRef } from "@utils/socketRef";
import { GlobalStoreState } from "../../types"
import { GlobalUserSlice } from "./types"
import { StateCreator } from "zustand"
import * as logic from "./logic";

export const createGlobalUsersSlice: StateCreator<GlobalStoreState, [["zustand/immer", never]], [], GlobalUserSlice> = (set, get) => ({
    users: {
        data: {
            userCache: new Map<number, PublicUserDataType>(),
            onlineUsers: new Set<number>(),
            friends: new Set<number>(),
            blockedUsers: new Set<number>(),
            userRelationships: new Map<number, FriendType>(),
        },

        actions: {
            fetchPublicUserData: (userId: number) => {
                getSocketSenderRef()(user_url.ws.users.requestUserProfileData, userId);
            },

            blockUser: (userId: number) => {
                getSocketSenderRef()(user_url.ws.users.blockUser, userId);
                set((state) => {
                    state.users.data.blockedUsers = logic.addToSet(state.users.data.blockedUsers, [userId]);
                });
            }
        },

        state: {
            cachePublicUserData: (userData: PublicUserDataType | PublicUserDataType[]) => {
                if (!Array.isArray(userData))
                    userData = [userData];

                set((state) => {
                    for (const data of userData)
                        state.users.data.userCache.set(data.id, data);
                });
            },

            addOnlineUsers: (userIds: number[]) => {
                set((state) => {
                    state.users.data.onlineUsers = logic.addToSet(state.users.data.onlineUsers, userIds);
                });
            },

            removeOnlineUsers: (userIds: number[]) => {
                set((state) => {
                    state.users.data.onlineUsers = logic.removeFromSet(state.users.data.onlineUsers, userIds);
                });
            },

            setUserRelationships: (relationships: FriendType[]) => {
                set((state) => {
                    state.users.data.userRelationships = logic.normalizeUserRelationships(relationships);
                    state.users.data.friends = logic.getFriendListFromRelationships(relationships);
                    state.users.data.blockedUsers = logic.getBlockedListFromRelationships(relationships);
                });
            },

            addFriend: (userId: number) => {
                set((state) => {
                    state.users.data.friends = logic.addToSet(state.users.data.friends, [userId]);
                });
            },

            blockUser: (userId: number) => {
                set((state) => {
                    state.users.data.blockedUsers = logic.addToSet(state.users.data.blockedUsers, [userId]);
                });
            }
        },
    },
});