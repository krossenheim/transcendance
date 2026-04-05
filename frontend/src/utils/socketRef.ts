import type { SocketMessageSender } from "@src/socketComponent";

let socketSenderRef: SocketMessageSender | null = null;

export const setSocketSenderRef = (sender: SocketMessageSender) => {
    socketSenderRef = sender;
};

export const getSocketSenderRef = (): SocketMessageSender => {
    if (!socketSenderRef) {
        return (message, payload) => {
            console.warn(`Socket sender not initialized. Cannot send message for route ${message.funcId}; payload: ${payload}`);
        }
    }
    return socketSenderRef;
};

