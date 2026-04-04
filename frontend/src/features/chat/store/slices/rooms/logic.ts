import { ChatRoomUserAccessType, TypeRoomSchema, TypeRoomUserConnectionSchema, TypeStoredMessageSchema } from "@app/shared/api/service/chat/db_models";
import { RoomUIData } from "./types";

const getDefaultRoomUIData = (): RoomUIData => ({
    unreadMessageCount: 0,
    lastVisitTimestamp: 0,
});

/**
 * Util function to normalize a list of rooms into a Map
 * @param rooms a list of rooms to be converted
 * @returns a map where the roomId is used as key
 */
export function normalizeRoomList(rooms: TypeRoomSchema[]): Map<number, TypeRoomSchema> {
    return new Map(rooms.map((room) => [room.roomId, room]));
}

/**
 * Util function to add a room to a Map of rooms
 * @param roomMap The original zustand data map
 * @param room The room to add to the data map
 * @returns A new Map with the added room; ready to be set in zustand
 */
export function addRoomToMap(roomMap: Map<number, TypeRoomSchema>, room: TypeRoomSchema): Map<number, TypeRoomSchema> {
    const newMap = new Map(roomMap);
    newMap.set(room.roomId, room);
    return newMap;
}

/**
 * Util function to remove a room from a Map of rooms
 * @param roomMap The original zustand data map
 * @param roomId The room id to remove from the data map
 * @returns A new Map without the removed room; ready to be set in zustand
 */
export function removeRoomFromMap(roomMap: Map<number, TypeRoomSchema>, roomId: number): Map<number, TypeRoomSchema> {
    const newMap = new Map(roomMap);
    newMap.delete(roomId);
    return newMap;
}

/**
 * Util function to update a room in a Map of rooms
 * @param roomMap The original zustand data map
 * @param room The room to update in the data map
 * @returns A new Map with the updated room; ready to be set in zustand
 */
export function updateRoomInMap(roomMap: Map<number, TypeRoomSchema>, room: TypeRoomSchema): Map<number, TypeRoomSchema> {
    const newMap = new Map(roomMap);
    newMap.set(room.roomId, room);
    return newMap;
}

/**
 * Util function to get the UI data for a room, or default if not found
 * @param roomUIDataMap The original zustand data map
 * @param roomId The room to get UI data for
 * @returns The UI data for the room, or default if not found
 */
export function getRoomUIDataOrDefault(roomUIDataMap: Map<number, RoomUIData>, roomId: number): RoomUIData {
    return roomUIDataMap.get(roomId) || getDefaultRoomUIData();
}

/**
 * Util function to ensure that all rooms in the room data map have corresponding UI data entries
 * @param roomUIDataMap The original zustand UI data map
 * @param roomData The current room data map
 * @returns A new Map with ensured UI data entries; ready to be set in zustand
 */
export function ensureRoomUIDataExists(roomUIDataMap: Map<number, RoomUIData>, roomData: Map<number, TypeRoomSchema>): Map<number, RoomUIData> {
    const newMap = new Map(roomUIDataMap);
    for (const roomId of roomData.keys())
        if (!newMap.has(roomId))
            newMap.set(roomId, getDefaultRoomUIData());
    return newMap;
}

/** Util function to remove UI data for a room from the UI data map
 * @param roomUIDataMap The original zustand UI data map
 * @param roomId The room id to remove UI data for
 * @returns A new Map without the removed UI data; ready to be set in zustand
 */
export function removeRoomUIData(roomUIDataMap: Map<number, RoomUIData>, roomId: number): Map<number, RoomUIData> {
    const newMap = new Map(roomUIDataMap);
    newMap.delete(roomId);
    return newMap;
}

/**
 * Util function to update the access type of a user in the current room user connections
 * @param userConnections The original list of user connections
 * @param userId The user id to update the access type for
 * @param access_state The new access type for the user
 * @returns A new array with the updated user connections; ready to be set in zustand
 */
export function updateUserRoomAccessType(userConnections: Array<TypeRoomUserConnectionSchema>, userId: number, access_state: ChatRoomUserAccessType): Array<TypeRoomUserConnectionSchema> {
    const updatedConnections = [...userConnections];
    let userIndex = updatedConnections.findIndex(conn => conn.userId === userId);

    if (userIndex !== -1)
        updatedConnections[userIndex]! = { ...updatedConnections[userIndex]!, userState: access_state };
    else
        updatedConnections.push({ userId, userState: access_state })

    return updatedConnections;
}

/**
 * Util function to store a new message in the current room messages
 * @param current_room_messages The original list of messages in the current room
 * @param message The new message to store
 * @returns A new array with the added message; ready to be set in zustand
 */
export function storeRoomMessage(current_room_messages: Array<TypeStoredMessageSchema>, message: TypeStoredMessageSchema): Array<TypeStoredMessageSchema> {
    return [...current_room_messages, message];
}

/**
 * Util function to increment the unread message count for a room in the UI data map
 * @param roomUIDataMap The original zustand UI data map
 * @param roomId The room id to increment the unread message count for
 * @param incrementAmount The amount to increment the unread message count by (default: 1)
 * @returns A new Map with the updated unread message count; ready to be set in zustand
 */
export function incrementUnreadMessageCountInRoom(roomUIDataMap: Map<number, RoomUIData>, roomId: number, incrementAmount: number = 1): Map<number, RoomUIData> {
    const newMap = new Map(roomUIDataMap);
    const roomUIData = getRoomUIDataOrDefault(newMap, roomId);
    newMap.set(roomId, { ...roomUIData, unreadMessageCount: roomUIData.unreadMessageCount + incrementAmount });
    return newMap;
}

/**
 * Util function to update the unread message count for a room in the UI data map
 * @param roomUIDataMap The original zustand UI data map
 * @param roomId The room id to update the unread message count for
 * @param count The new unread message count
 * @returns A new Map with the updated unread message count; ready to be set in zustand
 */
export function updateUnreadMessageCountInRoom(roomUIDataMap: Map<number, RoomUIData>, roomId: number, count: number): Map<number, RoomUIData> {
    const newMap = new Map(roomUIDataMap);
    newMap.set(roomId, { ...getRoomUIDataOrDefault(newMap, roomId), unreadMessageCount: count });
    return newMap;
}
