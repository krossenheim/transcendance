import { WebSocketRouteDef } from "@app/shared/api/service/common/endpoints";
import { Result } from "@app/shared/api/service/common/result";
import { useWebSocket } from "../socketComponent";
import { user_url } from "@app/shared/api/service/common/endpoints";
import { useChatStore } from "../stores/chatStore";
import { useGlobalStore } from "../stores/globalStore";
import { z } from "zod";

interface BaseSlashCommandArgs<T> {
    description: string;
    validator?: (input: string) => Result<T, string>;
    autocomplete?: (input: string) => T[];
}

interface TextSlashArg extends BaseSlashCommandArgs<string> {
    type: 'text';
};

interface NumberSlashArg extends BaseSlashCommandArgs<number> {
    type: 'number';
    min?: number;
    max?: number;
}

export type SlashCommandArg = TextSlashArg | NumberSlashArg;

type TypeMap = {
    text: string;
    number: number;
};

type ExtractArgsTypes<T extends readonly SlashCommandArg[]> = {
    [K in keyof T]: T[K] extends { type: infer TypeName }
    ? TypeName extends keyof TypeMap
    ? TypeMap[TypeName]
    : never
    : never;
};

export type SlashCommandContext = {
    sendMessage: <T extends WebSocketRouteDef>(route: T, payload: z.infer<T["schema"]["args"]>) => void;
}

export type SlashCommand<T extends readonly SlashCommandArg[]> = {
    name: string;
    description: string;
    args: T;
    execute: (args: ExtractArgsTypes<T>, context: SlashCommandContext) => void | Promise<void>;
}

const createSlashCommand = <const T extends readonly SlashCommandArg[]>(command: SlashCommand<T>) => command;

let allSlashCommands: SlashCommand<any>[] = [];

export const registerSlashCommand = <const T extends readonly SlashCommandArg[]>(command: SlashCommand<T>) => {
    allSlashCommands.push(command);
    return command;
};

registerSlashCommand(
    createSlashCommand({
        name: 'test',
        description: 'Test a user to the current chat room',
        args: [
            {
                description: 'The username of the person to invite',
                type: 'text',
                validator: (input: string) => {
                    if (input.length === 0) return Result.Err("Username cannot be empty");
                    if (input.length > 30) return Result.Err("Username cannot exceed 30 characters");
                    return Result.Ok(input);
                },
                autocomplete: (input: string) => {
                    const possibleUsernames = ['thivan-d', 'jose-lop', 'jbakker'];
                    return possibleUsernames.filter(name => name.toLowerCase().startsWith(input.toLowerCase()));
                }
            },
            {
                description: 'The age of the person to invite',
                type: 'number',
                min: 13,
                max: 120,
                validator: (input: string) => {
                    const age = Number(input);
                    if (isNaN(age)) return Result.Err("Age must be a number");
                    if (age < 13) return Result.Err("Age must be at least 13");
                    if (age > 120) return Result.Err("Age must be less than or equal to 120");
                    return Result.Ok(age);
                }
            },
        ],
        execute: async ([username]) => {
            console.log(`Inviting user: ${username}`);
        },
    })
);

registerSlashCommand(
    createSlashCommand({
        name: 'msg',
        description: 'Send a direct message to a user',
        args: [
            {
                description: 'The username of the recipient',
                type: 'text',
                validator: (input: string) => {
                    return Result.Ok(input);
                },
                autocomplete: (input: string) => {
                    const userCache = useGlobalStore.getState().publicUserDataCache;
                    const currentRoomUsers = useChatStore.getState().currentRoomUserConnections;

                    const possibleUsernames = currentRoomUsers
                        ? Array.from(currentRoomUsers)
                            .map(item => userCache.get(item.userId))
                            .filter(userData => userData !== undefined)
                            .map(userData => userData!.username)
                        : [];

                    return possibleUsernames.filter(name => name.toLowerCase().startsWith(input.toLowerCase()));
                }
            },
            {
                description: 'The message content',
                type: 'text',
                validator: (input: string) => {
                    const trimmed = input.trim();
                    if (trimmed.length === 0) return Result.Err("Message cannot be empty");
                    if (trimmed.length > 500) return Result.Err("Message cannot exceed 500 characters");
                    return Result.Ok(trimmed);
                }
            }
        ],
        execute: async ([username, message], { sendMessage }) => {
            console.log(`Sending message to ${username}: ${message}`);
            const userCache = useGlobalStore.getState().publicUserDataCache;
            console.log("User Cache:", userCache);
            const recipient = Array.from(userCache.values()).find(user => user.username === username);
            console.log("Recipient found:", recipient);
            if (!recipient) {
                console.error(`User ${username} not found in cache.`);
                return;
            }

            sendMessage(user_url.ws.chat.sendDirectMessage, {
                targetUserId: recipient.id,
                messageString: message,
            });
        },
    })
)

registerSlashCommand(
    createSlashCommand({
        name: 'invite',
        description: 'Invite a user to the current chat room',
        args: [
            {
                description: 'The username of the person to invite',
                type: 'text',
                validator: (input: string) => {
                    return Result.Ok(input);
                }
            }
        ],
        execute: async ([username], { sendMessage }) => {
            const currentRoomId = useChatStore.getState().currentRoomId;
            if (currentRoomId === null) {
                console.error("No current room selected for inviting users.");
                return;
            }

            sendMessage(user_url.ws.chat.addUserToRoom, {
                roomId: currentRoomId,
                user_to_add: username,
            })
        },
    })
);

export const getAllSlashCommands = () => {
    return allSlashCommands;
}

export const getPossibleSlashCommands = (prefix: string) => {
    return allSlashCommands.filter(cmd => cmd.name.startsWith(prefix) || prefix.startsWith(cmd.name));
}

export const getSlashCommandByName = (name: string) => {
    return allSlashCommands.find(cmd => cmd.name === name);
}