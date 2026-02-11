import type { TypeRoomSchema, TypeFullRoomInfoSchema, ChatRoomUserAccessType, TypeRoomUserConnectionSchema } from '@app/shared/api/service/chat/db_models';
import { TypeUserIdentifier } from '@app/shared/api/service/common/zodRules';
import { user_url } from '@app/shared/api/service/common/endpoints';
import { getSocketSenderRef } from '@utils/socketRef';
import { RoomSlice, RoomUIData } from './types';
import { ChatStoreState } from '../../types';
import { StateCreator } from "zustand";
import * as logic from './logic';

export const createRoomsSlice: StateCreator<ChatStoreState, [["zustand/immer", never]], [], RoomSlice> = (set, get) => ({
    rooms: {
        data: {
            userChatRooms: new Map<number, TypeRoomSchema>(),
            roomUIData: new Map<number, RoomUIData>(),
            currentRoomUserConnections: new Array<TypeRoomUserConnectionSchema>(),
            currentRoomId: null,
        },

        state: {
            updateFullRoomList: (rooms: TypeRoomSchema[]) => {
                set((state) => {
                    const roomData = logic.normalizeRoomList(rooms);
                    state.rooms.data.userChatRooms = roomData;
                    state.rooms.data.roomUIData = logic.ensureRoomUIDataExists(state.rooms.data.roomUIData, roomData);
                });
            },

            updateSingleRoom: (room: TypeRoomSchema) => {
                set((state) => {
                    state.rooms.data.userChatRooms = logic.updateRoomInMap(state.rooms.data.userChatRooms, room);
                    state.rooms.data.roomUIData = logic.ensureRoomUIDataExists(state.rooms.data.roomUIData, state.rooms.data.userChatRooms);
                });
            },

            setCurrentRoomId: (roomId: number | null) => {
                set((state) => {
                    state.rooms.data.currentRoomId = roomId;
                });
            },

            updateRoomUserConnections: (userConnections: TypeRoomUserConnectionSchema[]) => {
                set((state) => {
                    state.rooms.data.currentRoomUserConnections = userConnections;
                });
            },

            userLeftRoom: (roomId: number) => {
                if (get().rooms.data.currentRoomId === roomId) {
                    set((state) => {
                        state.rooms.data.currentRoomId = null;
                        state.rooms.data.currentRoomUserConnections = [];
                    });
                }

                set((state) => {
                    state.rooms.data.userChatRooms = logic.removeRoomFromMap(state.rooms.data.userChatRooms, roomId);
                    state.rooms.data.roomUIData = logic.removeRoomUIData(state.rooms.data.roomUIData, roomId);
                })
            },

            updateUserRoomState: (userId: number, access_state: ChatRoomUserAccessType) => {
                set((state) => {
                    state.rooms.data.currentRoomUserConnections = logic.updateUserRoomAccessType(state.rooms.data.currentRoomUserConnections, userId, access_state);
                });
            },

            updateUnreadCountForRoom: (roomId: number, count: number) => {
                set((state) => {
                    state.rooms.data.roomUIData = logic.updateUnreadMessageCountInRoom(state.rooms.data.roomUIData, roomId, count);
                });
            },

            incrementUnreadCountForRoom: (roomId: number) => {
                set((state) => {
                    state.rooms.data.roomUIData = logic.incrementUnreadMessageCountInRoom(state.rooms.data.roomUIData, roomId, 1);
                });
            },
        },

        actions: {
            inviteUserToRoom: (roomId: number, userData: TypeUserIdentifier) => {
                getSocketSenderRef()(user_url.ws.chat.addUserToRoom, {
                    roomId,
                    user_to_add: userData,
                });
            },

            fetchRoomData: (roomId: number) => {
                getSocketSenderRef()(user_url.ws.chat.getRoomData, {
                    roomId,
                });
            },
        },
    },
});
