/**
 * Utility functions for assigning consistent colors to users across the application
 */

import { Color3 } from "@babylonjs/core"

// Same color palette as used for paddles
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
  const colorIndex = userId % USER_COLORS.length
  const color = USER_COLORS[colorIndex]!
  const scale = darkMode ? 1 : 0.6
  return `rgb(${Math.round(color.r * scale)}, ${Math.round(color.g * scale)}, ${Math.round(color.b * scale)})`
}

/**
 * Get a Babylon.js Color3 for a user ID (for 3D rendering)
 * @param userId - The user's ID
 * @returns Babylon.js Color3 object
 */
export function getUserColorBabylon(userId: number): Color3 {
  const colorIndex = userId % USER_COLORS.length
  const color = USER_COLORS[colorIndex]!
  return new Color3(color.r / 255, color.g / 255, color.b / 255)
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
