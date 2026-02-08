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
 * Get a consistent CSS color for a user ID
 * @param userId - The user's ID
 * @param darkMode - Whether to use dark mode colors (brighter)
 * @returns CSS rgb string
 */
export function getUserColorCSS(userId: number, darkMode = true): string {
    const colorIndex = userId % USER_COLORS.length;
    const color = USER_COLORS[colorIndex]!;
    const scale = darkMode ? 1 : 0.6;
    return `rgb(${Math.round(color.r * scale)}, ${Math.round(color.g * scale)}, ${Math.round(color.b * scale)})`;
}

/**
 * Get a Babylon.js Color3 for a user ID (for 3D rendering)
 * @param userId - The user's ID
 * @returns Babylon.js Color3 object
 */
export function getUserColorBabylon(userId: number): Color3 {
    const colorIndex = userId % USER_COLORS.length;
    const color = USER_COLORS[colorIndex]!;
    return new Color3(color.r / 255, color.g / 255, color.b / 255);
}

/**
 * Get hex color for a user ID
 * @param userId - The user's ID
 * @param darkMode - Whether to use dark mode colors (brighter)
 * @returns Hex color string
 */
export function getUserColorHex(userId: number, darkMode = true): string {
    const colorIndex = userId % USER_COLORS.length
    const color = USER_COLORS[colorIndex]!
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
 * @returns The display name
 */
export function getVisualUserName(user?: { alias: string | null; username: string, id: number } | null, id?: number): string {
    if (!user) return `User ${id ?? ''}`;
    return (user.alias && user.alias.trim().length > 0 ? user.alias : user.username) || `User ${user.id}`;
}

/**
 * Get the initials for a user (for avatar placeholders)
 * @param user The user object containing username and optional alias + id
 * @param id The user ID (used if user is undefined)
 * @returns The initials as string
 */
export function getPlayerInitials(user?: { alias: string | null; username: string, id: number } | null, id?: number): string {
    const displayName = getVisualUserName(user, id);
    const nameParts = displayName.split('_').filter(part => part.length > 0);
    if (nameParts.length === 0) return '';
    if (nameParts.length === 1) return nameParts[0]!.slice(0, 2).toUpperCase();
    return (nameParts[0]![0]! + nameParts[nameParts.length - 1]![0]!).toUpperCase();
}
