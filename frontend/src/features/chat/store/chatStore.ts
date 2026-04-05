import { createMessagesSlice } from './slices/messages';
import { createRoomsSlice } from './slices/rooms';
import { immer } from 'zustand/middleware/immer';
import { ChatStoreState } from './types';
import { create } from 'zustand';

export const useChatStore = create<ChatStoreState>()(immer((...a) => ({
    ...createRoomsSlice(...a),
    ...createMessagesSlice(...a),
})));

