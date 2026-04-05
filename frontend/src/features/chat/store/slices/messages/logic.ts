import type { TypeStoredMessageSchema } from "@app/shared/api/service/chat/db_models";

export function normalizeMessageList(messages: TypeStoredMessageSchema[]): Map<number, TypeStoredMessageSchema> {
    return new Map(messages.map((msg) => [msg.messageId, msg]));
}

export function appendMessage(old: TypeStoredMessageSchema[], message: TypeStoredMessageSchema): TypeStoredMessageSchema[] {
    return [...old, message];
}

