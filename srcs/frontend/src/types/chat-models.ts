// Frontend chat model facades
// Frontend chat model facades (lightweight copies to avoid bundling shared/server code)

export interface TypeStoredMessageSchema {
  id: number
  roomId: number
  senderId: number
  content: string
  timestamp: number
}

export interface TypeRoomSchema {
  id: number
  name: string
}

export interface TypeFullRoomInfoSchema {
  id: number
  name: string
  members: number[]
}

export type TypeListRoomsSchema = TypeRoomSchema[]

export interface TypeRoomMessagesSchema {
  roomId: number
  messages: TypeStoredMessageSchema[]
}

// Simple access enum used by chat components
export enum ChatRoomUserAccessType {
  INVITED = 0,
  JOINED = 1,
}
