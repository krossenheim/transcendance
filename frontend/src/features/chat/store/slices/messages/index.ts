import type { TypeStoredMessageSchema } from "@app/shared/api/service/chat/db_models";
import { user_url } from "@app/shared/api/service/common/endpoints";
import { getSocketSenderRef } from "@utils/socketRef";
import { ChatStoreState } from "../../types";
import { MessageSlice } from "./types";
import { StateCreator } from "zustand";
import * as logic from "./logic";

export const createMessagesSlice: StateCreator<ChatStoreState, [["zustand/immer", never]], [], MessageSlice> = (set, get) => ({
    messages: {
        data: {
            messagesPerRoom: new Map<number, TypeStoredMessageSchema[]>(),
        },

        actions: {
            sendMessageToRoom: (roomId: number, content: string) => {
                getSocketSenderRef()(user_url.ws.chat.sendMessage, {
                    roomId,
                    messageString: content,
                })
            },
        },

        state: {
            setMessagesForRoom: (roomId: number, messages: TypeStoredMessageSchema[]) => {
                set((state) => {
                    state.messages.data.messagesPerRoom.set(roomId, Array.from(messages));
                });
            },

            addMessageToRoom: (message: TypeStoredMessageSchema) => {
                set((state) => {
                    state.messages.data.messagesPerRoom.set(message.roomId, logic.appendMessage(state.messages.data.messagesPerRoom.get(message.roomId) || [], message));

                    if (state.rooms.data.currentRoomId !== message.roomId)
                        state.rooms.state.incrementUnreadCountForRoom(message.roomId);
                });
            },

            removeMessagesForRoom: (roomId: number) => {
                set((state) => {
                    console.log("Removing messages for room", roomId, typeof roomId);
                    state.messages.data.messagesPerRoom.delete(roomId);
                });
            },
        },
    },
});

