import { PublicUserDataType } from "@app/shared/api/service/db/user";
import { Color3 } from "@babylonjs/core";

const USER_COLORS = [
    { r: 0, g: 255, b: 0 },      // Green
    { r: 0, g: 128, b: 255 },    // Blue
    { r: 255, g: 128, b: 0 },    // Orange
    { r: 255, g: 0, b: 255 },    // Magenta
    { r: 255, g: 255, b: 0 },    // Yellow
    { r: 0, g: 255, b: 255 },    // Cyan
    { r: 153, g: 51, b: 255 },   // Purple
    { r: 255, g: 51, b: 102 },   // Pink
]

/**
 * Map a user ID to a color index, offsetting negative IDs (AI/guest players)
 * so they don't collide with positive (human) IDs.
 *
 * AI IDs are -1001, -1002, … so the sequential index is (abs - 1001) = 0, 1, 2, …
 * We walk the palette in reverse order (starting from the end) so AI colours
 * stay as far as possible from the low-index colours that human IDs tend to get.
 */
function userColorIndex(userId: number): number {
    const len = USER_COLORS.length;
    if (userId <= -1001) {
        // Sequential AI index: -1001→0, -1002→1, …
        const aiSeq = Math.abs(userId) - 1001;
        // Walk backwards from end of palette: 7, 6, 5, 4, 3, 2, 1, 0
        return (len - 1 - (aiSeq % len));
    }
    if (userId < 0) {
        // Other negative IDs (guests, local players)
        return (len - 1 - (Math.abs(userId) % len));
    }
    return userId % len;
}

/**
 * Game-context-aware color index: assigns each player a unique color by their
 * position in the sorted player list. Guarantees no two players share a color
 * (up to USER_COLORS.length players).
 */
let _cachedAllPlayers: number[] = [];
let _cachedColorMap: Map<number, number> = new Map();

export function setGamePlayerIds(allPlayerIds: number[]): void {
    // Only rebuild if the player list has changed
    if (allPlayerIds.length === _cachedAllPlayers.length &&
        allPlayerIds.every((id, i) => id === _cachedAllPlayers[i])) {
        return;
    }
    _cachedAllPlayers = [...allPlayerIds];
    _cachedColorMap = new Map();
    // Assign colors in order: first player gets index 0, second gets 1, etc.
    for (let i = 0; i < allPlayerIds.length; i++) {
        _cachedColorMap.set(allPlayerIds[i]!, i % USER_COLORS.length);
    }
}

function gameAwareColorIndex(userId: number): number {
    const mapped = _cachedColorMap.get(userId);
    if (mapped !== undefined) return mapped;
    // Fallback to global mapping if player not in current game context
    return userColorIndex(userId);
}

/**
 * Get a consistent CSS color for a user ID
 * @param userId - The user's ID
 * @param darkMode - Whether to use dark mode colors (brighter)
 * @returns CSS rgb string
 */
export function getUserColorCSS(userId: number, darkMode = true): string {
    const color = USER_COLORS[gameAwareColorIndex(userId)]!;
    const scale = darkMode ? 1 : 0.6;
    return `rgb(${Math.round(color.r * scale)}, ${Math.round(color.g * scale)}, ${Math.round(color.b * scale)})`;
}

/**
 * Get a Babylon.js Color3 for a user ID (for 3D rendering)
 * @param userId - The user's ID
 * @returns Babylon.js Color3 object
 */
export function getUserColorBabylon(userId: number): Color3 {
    const color = USER_COLORS[gameAwareColorIndex(userId)]!;
    return new Color3(color.r / 255, color.g / 255, color.b / 255);
}

/**
 * Get hex color for a user ID
 * @param userId - The user's ID
 * @param darkMode - Whether to use dark mode colors (brighter)
 * @returns Hex color string
 */
export function getUserColorHex(userId: number, darkMode = true): string {
    const color = USER_COLORS[gameAwareColorIndex(userId)]!
    const scale = darkMode ? 1 : 0.6
    const r = Math.round(color.r * scale).toString(16).padStart(2, '0')
    const g = Math.round(color.g * scale).toString(16).padStart(2, '0')
    const b = Math.round(color.b * scale).toString(16).padStart(2, '0')
    return `#${r}${g}${b}`
}

/**
 * Get the visual display name for a user
 * @param user - The user object containing username and optional alias + id
 * @param id - The user ID (used if user is undefined)
 * @param max_length - Optional maximum length for the display name (truncated with ellipsis if exceeded). Default is 20 characters.
 * @returns The display name
 */
export function getVisualUserName(user?: { alias: string | null; username: string, id: number } | null, id?: number, max_length: number | null = 20): string {
    if (!user) return `User ${id ?? ''}`;
    const visualUsername: string = (user.alias && user.alias.trim().length > 0 ? user.alias : user.username) || `User ${user.id}`;
    if (max_length !== null && visualUsername.length > max_length)
        return visualUsername.slice(0, Math.max(0, max_length - 3)) + '...';
    return visualUsername;
}

/**
 * Get the initials for a user (for avatar placeholders)
 * @param user The user object containing username and optional alias + id
 * @param id The user ID (used if user is undefined)
 * @returns The initials as string
 */
export function getPlayerInitials(user?: { alias: string | null; username: string, id: number } | null, id?: number): string {
    const displayName = getVisualUserName(user, id, null);
    const nameParts = displayName.split('_').filter(part => part.length > 0);
    if (nameParts.length === 0) return '';
    if (nameParts.length === 1) return nameParts[0]!.slice(0, 2).toUpperCase();
    return (nameParts[0]![0]! + nameParts[nameParts.length - 1]![0]!).toUpperCase();
}
