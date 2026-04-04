import type { TypeStoredMessageSchema } from "@app/shared/api/service/chat/db_models";

/**
 * Util function to normalize a list of messages into a Map
 * @param messages a list of messages to be converted
 * @returns a map where the messageId is used as key
 */
export function normalizeMessageList(messages: TypeStoredMessageSchema[]): Map<number, TypeStoredMessageSchema> {
    return new Map(messages.map((msg) => [msg.messageId, msg]));
}

/**
 * Util function to append a message to an array of messages
 * @param old The original array of messages
 * @param message The message to append
 * @returns A new array with the appended message
 */
export function appendMessage(old: TypeStoredMessageSchema[], message: TypeStoredMessageSchema): TypeStoredMessageSchema[] {
    return [...old, message];
}
