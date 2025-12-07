/**
 * Shared types for chat components
 */

export interface ChatMessage {
  user: string
  content: string
  timestamp?: string
  userId?: number
}

export interface RoomUser {
  id: number
  username: string
  onlineStatus?: number
}

export interface SlashCommand {
  name: string
  description: string
  aliases?: string[]
}
