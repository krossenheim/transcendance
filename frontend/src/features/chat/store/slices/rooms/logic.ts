import { ChatRoomUserAccessType, TypeRoomSchema, TypeRoomUserConnectionSchema, TypeStoredMessageSchema } from "@app/shared/api/service/chat/db_models";
import { RoomUIData } from "./types";

const getDefaultRoomUIData = (): RoomUIData => ({
    unreadMessageCount: 0,
    lastVisitTimestamp: 0,
});

export function normalizeRoomList(rooms: TypeRoomSchema[]): Map<number, TypeRoomSchema> {
    return new Map(rooms.map((room) => [room.roomId, room]));
}

export function addRoomToMap(roomMap: Map<number, TypeRoomSchema>, room: TypeRoomSchema): Map<number, TypeRoomSchema> {
    const newMap = new Map(roomMap);
    newMap.set(room.roomId, room);
    return newMap;
}

export function removeRoomFromMap(roomMap: Map<number, TypeRoomSchema>, roomId: number): Map<number, TypeRoomSchema> {
    const newMap = new Map(roomMap);
    newMap.delete(roomId);
    return newMap;
}

export function updateRoomInMap(roomMap: Map<number, TypeRoomSchema>, room: TypeRoomSchema): Map<number, TypeRoomSchema> {
    const newMap = new Map(roomMap);
    newMap.set(room.roomId, room);
    return newMap;
}

export function getRoomUIDataOrDefault(roomUIDataMap: Map<number, RoomUIData>, roomId: number): RoomUIData {
    return roomUIDataMap.get(roomId) || getDefaultRoomUIData();
}

export function ensureRoomUIDataExists(roomUIDataMap: Map<number, RoomUIData>, roomData: Map<number, TypeRoomSchema>): Map<number, RoomUIData> {
    const newMap = new Map(roomUIDataMap);
    for (const roomId of roomData.keys())
        if (!newMap.has(roomId))
            newMap.set(roomId, getDefaultRoomUIData());
    return newMap;
}

export function removeRoomUIData(roomUIDataMap: Map<number, RoomUIData>, roomId: number): Map<number, RoomUIData> {
    const newMap = new Map(roomUIDataMap);
    newMap.delete(roomId);
    return newMap;
}

export function updateUserRoomAccessType(userConnections: Array<TypeRoomUserConnectionSchema>, userId: number, access_state: ChatRoomUserAccessType): Array<TypeRoomUserConnectionSchema> {
    const updatedConnections = [...userConnections];
    let userIndex = updatedConnections.findIndex(conn => conn.userId === userId);

    if (userIndex !== -1)
        updatedConnections[userIndex]! = { ...updatedConnections[userIndex]!, userState: access_state };
    else
        updatedConnections.push({ userId, userState: access_state })

    return updatedConnections;
}

export function storeRoomMessage(current_room_messages: Array<TypeStoredMessageSchema>, message: TypeStoredMessageSchema): Array<TypeStoredMessageSchema> {
    return [...current_room_messages, message];
}

export function incrementUnreadMessageCountInRoom(roomUIDataMap: Map<number, RoomUIData>, roomId: number, incrementAmount: number = 1): Map<number, RoomUIData> {
    const newMap = new Map(roomUIDataMap);
    const roomUIData = getRoomUIDataOrDefault(newMap, roomId);
    newMap.set(roomId, { ...roomUIData, unreadMessageCount: roomUIData.unreadMessageCount + incrementAmount });
    return newMap;
}

export function updateUnreadMessageCountInRoom(roomUIDataMap: Map<number, RoomUIData>, roomId: number, count: number): Map<number, RoomUIData> {
    const newMap = new Map(roomUIDataMap);
    newMap.set(roomId, { ...getRoomUIDataOrDefault(newMap, roomId), unreadMessageCount: count });
    return newMap;
}

