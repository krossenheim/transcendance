import { MessageSlice } from "./slices/messages/types";
import { RoomSlice } from "./slices/rooms/types";

export type ChatStoreState = RoomSlice & MessageSlice;