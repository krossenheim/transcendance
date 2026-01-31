import type { TypeRoomSchema, TypeFullRoomInfoSchema, TypeRoomUserConnectionSchema } from '@app/shared/api/service/chat/db_models';
import { TypeUserIdentifier } from '@app/shared/api/service/common/zodRules';

export interface RoomUIData {
    unreadMessageCount: number;
    lastVisitTimestamp: number;
}

export interface RoomData {
    userChatRooms: Map<number, TypeRoomSchema>;
    roomUIData: Map<number, RoomUIData>;
    currentRoomUserConnections: TypeRoomUserConnectionSchema[];
    currentRoomId: number | null;
}

export interface RoomActions {
    // joinRoom: (roomId: number) => void;
    // leaveRoom: (roomId: number) => void;
    // switchToRoom: (roomId: number) => void;
    inviteUserToRoom: (roomId: number, userData: TypeUserIdentifier) => void;
}

export interface RoomStates {
    updateFullRoomList: (room: TypeRoomSchema[]) => void;
    updateSingleRoom: (room: TypeRoomSchema) => void;
    setCurrentRoomId: (roomId: number | null) => void;
    updateRoomUserConnections: (userConnections: TypeRoomUserConnectionSchema[]) => void;
    userLeftRoom: (roomId: number) => void;
    updateUserRoomState: (userId: number, access_state: number) => void;
    updateUnreadCountForRoom: (roomId: number, count: number) => void;
    incrementUnreadCountForRoom: (roomId: number) => void;
}

export interface RoomSlice {
    rooms: {
        data: RoomData;
        actions: RoomActions;
        state: RoomStates;
    },
};
