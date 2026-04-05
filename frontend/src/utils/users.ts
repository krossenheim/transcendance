import { PublicUserDataType } from "@app/shared/api/service/db/user";
import { Color3 } from "@babylonjs/core";

const USER_COLORS = [
    { r: 0, g: 255, b: 0 },
    { r: 0, g: 128, b: 255 },
    { r: 255, g: 128, b: 0 },
    { r: 255, g: 0, b: 255 },
    { r: 255, g: 255, b: 0 },
    { r: 0, g: 255, b: 255 },
    { r: 153, g: 51, b: 255 },
    { r: 255, g: 51, b: 102 },
    { r: 255, g: 60, b: 60 },
    { r: 0, g: 200, b: 150 },
    { r: 255, g: 160, b: 120 },
    { r: 128, g: 255, b: 0 },
]

function userColorIndex(userId: number): number {
    const len = USER_COLORS.length;
    if (userId <= -1001) {
        const aiSeq = Math.abs(userId) - 1001;
        return (len - 1 - (aiSeq % len));
    }
    if (userId < 0) {
        return (len - 1 - (Math.abs(userId) % len));
    }
    return userId % len;
}

let _cachedAllPlayers: number[] = [];
let _cachedColorMap: Map<number, number> = new Map();

export function setGamePlayerIds(allPlayerIds: number[]): void {
    if (allPlayerIds.length === _cachedAllPlayers.length &&
        allPlayerIds.every((id, i) => id === _cachedAllPlayers[i])) {
        return;
    }
    _cachedAllPlayers = [...allPlayerIds];
    _cachedColorMap = new Map();
    for (let i = 0; i < allPlayerIds.length; i++) {
        _cachedColorMap.set(allPlayerIds[i]!, i % USER_COLORS.length);
    }
}

function gameAwareColorIndex(userId: number): number {
    const mapped = _cachedColorMap.get(userId);
    if (mapped !== undefined) return mapped;
    return userColorIndex(userId);
}

export function getUserColorCSS(userId: number): string {
    const color = USER_COLORS[gameAwareColorIndex(userId)]!;
    return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

export function getUserColorBabylon(userId: number): Color3 {
    const color = USER_COLORS[gameAwareColorIndex(userId)]!;
    return new Color3(color.r / 255, color.g / 255, color.b / 255);
}

export function getUserColorHex(userId: number): string {
    const color = USER_COLORS[gameAwareColorIndex(userId)]!
    const r = color.r.toString(16).padStart(2, '0')
    const g = color.g.toString(16).padStart(2, '0')
    const b = color.b.toString(16).padStart(2, '0')
    return `#${r}${g}${b}`
}

export function getVisualUserName(user?: { alias: string | null; username: string, id: number } | null, id?: number, max_length: number | null = 20): string {
    if (!user) return `User ${id ?? ''}`;
    const visualUsername: string = (user.alias && user.alias.trim().length > 0 ? user.alias : user.username) || `User ${user.id}`;
    if (max_length !== null && visualUsername.length > max_length)
        return visualUsername.slice(0, Math.max(0, max_length - 3)) + '...';
    return visualUsername;
}

export function getPlayerInitials(user?: { alias: string | null; username: string, id: number } | null, id?: number): string {
    const displayName = getVisualUserName(user, id, null);
    const nameParts = displayName.split('_').filter(part => part.length > 0);
    if (nameParts.length === 0) return '';
    if (nameParts.length === 1) return nameParts[0]!.slice(0, 2).toUpperCase();
    return (nameParts[0]![0]! + nameParts[nameParts.length - 1]![0]!).toUpperCase();
}

