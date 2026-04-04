import type { PendingFriendshipRequestType, UserNotificationsType } from "@app/shared/api/service/db/notification";
import { PublicUserDataType, FriendType } from "@app/shared/api/service/db/user";
import type { TypeRoomSchema } from "@app/shared/api/service/chat/db_models";
import { user_url } from "@app/shared/api/service/common/endpoints";
import { Result } from "@app/shared/api/service/common/result";
import { getSocketSenderRef } from "@utils/socketRef";
import { GlobalStoreState } from "../../types"
import { GlobalUserSlice } from "./types"
import { apiCall } from "@utils/useApi";
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
            notifications: {
                pendingFriendRequests: [],
                pendingRoomInvites: [],
            }
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
            },

            sendFriendRequest: (userId: number) => {
                getSocketSenderRef()(user_url.ws.users.requestFriendship, userId);
            },

            acceptFriendRequest: (userId: number) => {
                getSocketSenderRef()(user_url.ws.users.confirmFriendship, userId);

                set((state) => {
                    state.users.data.notifications = logic.removePendingFriendRequestFromUser(state.users.data.notifications, userId);
                });
            },

            denyFriendRequest: (userId: number) => {
                getSocketSenderRef()(user_url.ws.users.denyFriendship, userId);

                set((state) => {
                    state.users.data.notifications = logic.removePendingFriendRequestFromUser(state.users.data.notifications, userId);
                });
            },

            acceptRoomInvite: (roomId: number) => {
                getSocketSenderRef()(user_url.ws.chat.joinRoom, { roomId });

                set((state) => {
                    state.users.data.notifications = logic.removePendingRoomInviteFromUser(state.users.data.notifications, roomId);
                })
            },

            fetchUserProfileUrl: async (url: string): Promise<Result<string, string>> => {
                const apiResult = await apiCall(user_url.http.users.fetchUserAvatar, {
                    body: { file: url },
                })

                if (apiResult.code === 200) {
                    console.log("Fetched user profile avatar data:", apiResult);
                    const raw = apiResult.payload as string;
                    const base64 = raw.startsWith("data:") ? raw.split(",")[1]! : raw;
                    const binary = atob(base64);
                    const len = binary.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++)
                        bytes[i] = binary.charCodeAt(i);
                    const blob = new Blob([bytes], { type: "image/png" });
                    const objectUrl = URL.createObjectURL(blob);
                    console.log("Created object URL for avatar:", objectUrl);
                    return Result.Ok(objectUrl);
                }
                else
                    return Result.Err(apiResult.payload.message as string);

            },

            fetchUserConnections: () => {
                getSocketSenderRef()(user_url.ws.users.fetchUserConnections, null);
            },

            removeFriendship: (userId: number) => {
                getSocketSenderRef()(user_url.ws.users.removeFriendship, userId);
                set((state) => {
                    state.users.data.friends = logic.removeFromSet(state.users.data.friends, [userId]);
                });
            },

            unblockUser: (userId: number) => {
                getSocketSenderRef()(user_url.ws.users.unblockUser, userId);
                set((state) => {
                    state.users.data.blockedUsers = logic.removeFromSet(state.users.data.blockedUsers, [userId]);
                });
            },
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
            },

            updateUserNotifications: (notifications: UserNotificationsType) => {
                set((state) => {
                    state.users.data.notifications = notifications;
                });
            },
        },
    },
});