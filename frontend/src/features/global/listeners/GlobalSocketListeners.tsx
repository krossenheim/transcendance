import { ChatSocketListeners } from "../../chat/listeners/ChatSocketListeners";
import { user_url } from "@app/shared/api/service/common/endpoints";
import { useToastStore, toast } from "@src/features/toast/toastStore";
import { setSocketSenderRef } from "@utils/socketRef";
import { useGlobalStore } from "../store/globalStore";
import { HandlerResult } from "@src/socketComponent";
import { useWebSocket } from "@src/socketComponent";
import { useEffect } from "react";

const BaseSocketListeners = () => {
    const { subscribe, sendMessage } = useWebSocket();

    useEffect(() => {
        const unsubscribers: (() => void)[] = [];

        unsubscribers.push(subscribe(user_url.ws.users.userOnlineStatusUpdate, (payload, schema) => {
            switch (payload.code) {
            case schema.output.GetOnlineUsers.code: {
                const globalUserState = useGlobalStore.getState().users.state;
                globalUserState.addOnlineUsers(payload.payload);
                return HandlerResult.Handled;
            }

            case schema.output.GetOfflineUsers.code: {
                const globalUserState = useGlobalStore.getState().users.state;
                globalUserState.removeOnlineUsers(payload.payload);
                return HandlerResult.Handled;
            }

            default:
                return HandlerResult.NotHandled;
            }
        }));

        unsubscribers.push(subscribe(user_url.ws.users.requestUserProfileData, (payload, schema) => {
            switch (payload.code) {
            case schema.output.Success.code: {
                const globalUserState = useGlobalStore.getState().users.state;
                globalUserState.cachePublicUserData(payload.payload);
                return HandlerResult.Handled;
            }

            default:
                return HandlerResult.NotHandled;
            }
        }));

        unsubscribers.push(subscribe(user_url.ws.users.updateProfile, (payload, schema) => {
            switch (payload.code) {
                case schema.output.ProfileUpdated.code: {
                    const meState = useGlobalStore.getState().me.state;
                    meState.setCurrentUserData(payload.payload);

                    const globalUserState = useGlobalStore.getState().users.state;
                    globalUserState.cachePublicUserData({ ...payload.payload, onlineStatus: null });

                    toast.success("Profile updated successfully");
                    return HandlerResult.Handled;
                }

                case schema.output.FailedToUpdate.code: {
                    toast.error(payload.payload.message || "Failed to update profile");
                    return HandlerResult.Handled;
                }

                default:
                    return HandlerResult.NotHandled;
            }
        }));

        unsubscribers.push(subscribe(user_url.ws.users.fetchUserConnections, (payload, schema) => {
            switch (payload.code) {
                case schema.output.Success.code: {
                    const globalUserState = useGlobalStore.getState().users.state;
                    globalUserState.setUserRelationships(payload.payload);
                    return HandlerResult.Handled;
                }

                default:
                    return HandlerResult.NotHandled;
            }
        }));

        unsubscribers.push(subscribe(user_url.ws.users.fetchUserNotifications, (payload, schema) => {
            switch (payload.code) {
                case schema.output.Success.code: {
                    const globalUserState = useGlobalStore.getState().users.state;
                    const currentNotifications = useGlobalStore.getState().users.data.notifications;
                    const newNotifications = payload.payload;

                    const currentFriendRequestIds = new Set(
                        currentNotifications.pendingFriendRequests.map(r => r.friendId)
                    );
                    const newFriendRequests = newNotifications.pendingFriendRequests.filter(
                        r => !currentFriendRequestIds.has(r.friendId)
                    );
                    for (const req of newFriendRequests) {
                        const username = req.username || `User ${req.friendId}`;
                        toast.info(`${username} sent you a friend request`);
                    }

                    const currentRoomInviteIds = new Set(
                        currentNotifications.pendingRoomInvites.map(r => r.roomId)
                    );
                    const newRoomInvites = newNotifications.pendingRoomInvites.filter(
                        r => !currentRoomInviteIds.has(r.roomId)
                    );
                    for (const invite of newRoomInvites) {
                        toast.info(`You've been invited to room "${invite.roomName}"`);
                    }

                    globalUserState.updateUserNotifications(newNotifications);
                    return HandlerResult.Handled;
                }

                default:
                    return HandlerResult.NotHandled;
            }
        }));

        return () => {
            unsubscribers.forEach((unsub) => unsub());
        };

    }, [subscribe, sendMessage]);

    return null;
}

export const GlobalSocketListeners = () => {
    const { sendMessage } = useWebSocket();

    useEffect(() => {
        setSocketSenderRef(sendMessage);
    }, [sendMessage]);

    return (
        <>
            <BaseSocketListeners />
            <ChatSocketListeners />
        </>
    );
}

