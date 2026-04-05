import { TypeStoredMessageSchema } from "@src/types/chat-models";

export interface MessageData {
    messagesPerRoom: Map<number, TypeStoredMessageSchema[]>;
}

export interface MessageActions {
    sendMessageToRoom: (roomId: number, content: string) => void;
}

export interface MessageStates {
    setMessagesForRoom: (roomId: number, messages: TypeStoredMessageSchema[]) => void;
    addMessageToRoom: (message: TypeStoredMessageSchema) => void;
}

export interface MessageSlice {
    messages: {
        data: MessageData;
        actions: MessageActions;
        state: MessageStates;
    },
};

