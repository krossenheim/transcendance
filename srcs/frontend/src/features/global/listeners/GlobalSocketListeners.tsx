import { ChatSocketListeners } from "../../chat/listeners/ChatSocketListeners";
import { user_url } from "@app/shared/api/service/common/endpoints";
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
                    globalUserState.updateUserNotifications(payload.payload);
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