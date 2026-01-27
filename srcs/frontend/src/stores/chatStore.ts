import type { TypeRoomUserConnectionSchema, TypeStoredMessageSchema, TypeFullRoomInfoSchema } from '@app/shared/api/service/chat/db_models';
import type { TypeRoomSchema } from '@app/shared/api/service/chat/db_models';
import { create } from 'zustand';

interface RoomUIData {
    unreadMessageCount: number;
    lastVisitTimestamp: number;
}

interface ChatState {
    userChatRooms: Map<number, TypeRoomSchema>;
    roomUIData: Map<number, RoomUIData>;

    currentRoomId: number | null;
    currentRoomMessages: TypeStoredMessageSchema[];
    currentRoomUserConnections: TypeRoomUserConnectionSchema[];

    setUserChatRooms: (rooms: TypeRoomSchema[]) => void;
    setSingleUserChatRoom: (room: TypeRoomSchema) => void;
    setCurrentRoomData: (data: TypeFullRoomInfoSchema) => void;
    leaveRoom: (roomId: number) => void;

    incrementUnreadCount: (roomId: number) => void;
    resetUnreadCount: (roomId: number) => void;
    addRoomMessage: (message: TypeStoredMessageSchema) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
    userChatRooms: new Map<number, TypeRoomSchema>(),
    roomUIData: new Map<number, RoomUIData>(),

    currentRoomId: null,
    currentRoomMessages: [],
    currentRoomUserConnections: [],

    setUserChatRooms: (rooms: TypeRoomSchema[]) => {
        set(() => ({
            userChatRooms: new Map(rooms.map((room) => [room.roomId, room])),
            roomUIData: new Map(rooms.map((room) => [room.roomId, { unreadMessageCount: 0, lastVisitTimestamp: 0, ...get().roomUIData.get(room.roomId) }])),
        }));
    },

    setSingleUserChatRoom: (room: TypeRoomSchema) => {
        const updatedRooms = new Map(get().userChatRooms);
        updatedRooms.set(room.roomId, room);

        const updatedUIData = new Map(get().roomUIData);
        if (!updatedUIData.has(room.roomId)) {
            updatedUIData.set(room.roomId, { unreadMessageCount: 0, lastVisitTimestamp: 0 });
        }

        set(() => ({
            userChatRooms: updatedRooms,
            roomUIData: updatedUIData,
        }));
    },

    setCurrentRoomData: (data: TypeFullRoomInfoSchema) => {
        set(() => ({
            currentRoomId: data.room.roomId,
            currentRoomMessages: data.messages,
            currentRoomUserConnections: data.userConnections,
        }));
    },

    leaveRoom: (roomId: number) => {
        if (get().currentRoomId === roomId) {
            set(() => ({
                currentRoomId: null,
                currentRoomMessages: [],
                currentRoomUserConnections: [],
            }));
        }

        const updatedRooms = new Map(get().userChatRooms);
        updatedRooms.delete(roomId);

        const updatedUIData = new Map(get().roomUIData);
        updatedUIData.delete(roomId);
        set(() => ({
            userChatRooms: updatedRooms,
            roomUIData: updatedUIData,
        }));
    },

    incrementUnreadCount: (roomId: number) => {
        const roomUIData = new Map(get().roomUIData);
        const uiData = roomUIData.get(roomId) || { unreadMessageCount: 0, lastVisitTimestamp: 0 };
        uiData.unreadMessageCount += 1;
        roomUIData.set(roomId, uiData);
        set(() => ({ roomUIData }));
    },

    resetUnreadCount: (roomId: number) => {
        const roomUIData = new Map(get().roomUIData);
        const uiData = roomUIData.get(roomId) || { unreadMessageCount: 0, lastVisitTimestamp: 0 };
        uiData.unreadMessageCount = 0;
        roomUIData.set(roomId, uiData);
        set(() => ({ roomUIData }));
    },

    addRoomMessage: (message: TypeStoredMessageSchema) => {
        set((state) => ({
            currentRoomMessages: [...state.currentRoomMessages, message],
        }));
    }
}));