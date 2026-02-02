import { useChatStore } from "../features/chat/store/chatStore";
import { Result } from "@app/shared/api/service/common/result";
import { useGlobalStore } from "../features/global/store/globalStore";

interface BaseSlashCommandArgs<T> {
    description: string;
    validator: (input: string) => Result<T, string>;
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

export type SlashCommand<T extends readonly SlashCommandArg[]> = {
    name: string;
    description: string;
    args: T;
    execute: (args: ExtractArgsTypes<T>) => void | Promise<void>;
}

const createSlashCommand = <const T extends readonly SlashCommandArg[]>(command: SlashCommand<T>) => command;

let allSlashCommands: SlashCommand<any>[] = [];

export const registerSlashCommand = <const T extends readonly SlashCommandArg[]>(command: SlashCommand<T>) => {
    allSlashCommands.push(command);
    return command;
};

function autocompleteCurrentRoomUsers(input: string): string[] {
    const userCache = useGlobalStore.getState().users.data.userCache;
    const currentRoomUsers = useChatStore.getState().rooms.data.currentRoomUserConnections;

    const possibleUsernames = currentRoomUsers
        ? Array.from(currentRoomUsers)
            .map(item => userCache.get(item.userId))
            .filter(userData => userData !== undefined)
            .map(userData => userData!.username)
        : [];

    return possibleUsernames.filter(name => name.toLowerCase().startsWith(input.toLowerCase()));
}

function validateCurrentRoomUser(input: string): Result<string, string> {
    const userCache = useGlobalStore.getState().users.data.userCache;
    const currentRoomUsers = useChatStore.getState().rooms.data.currentRoomUserConnections;

    const possibleUsernames = currentRoomUsers
        ? Array.from(currentRoomUsers)
            .map(item => userCache.get(item.userId))
            .filter(userData => userData !== undefined)
            .map(userData => userData!.username)
        : [];

    if (possibleUsernames.includes(input)) {
        return Result.Ok(input);
    } else {
        return Result.Err(`User ${input} is not in the current room.`);
    }
}

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
        execute: async ([username]) => {
            const chatState = useChatStore.getState();
            const currentRoomId = chatState.rooms.data.currentRoomId;
            if (currentRoomId === null) {
                console.error("No current room selected for inviting users.");
                return;
            }

            chatState.rooms.actions.inviteUserToRoom(currentRoomId, username);
        },
    })
);

registerSlashCommand(
    createSlashCommand({
        name: 'block',
        description: 'Block a user',
        args: [
            {
                description: 'The username of the person to block',
                type: 'text',
                validator: validateCurrentRoomUser,
                autocomplete: autocompleteCurrentRoomUsers,
            }
        ],
        execute: async ([username]) => {
            console.log(`Blocking user: ${username}`);
            const globalState = useGlobalStore.getState();
            const userCache = globalState.users.data.userCache;
            const targetUser = Array.from(userCache.values()).find(user => user.username === username);
            if (!targetUser) {
                console.error(`User ${username} not found in cache.`);
                return;
            }

            globalState.users.actions.blockUser(targetUser.id);
        }
    })
)

registerSlashCommand(
    createSlashCommand({
        name: 'befriend',
        description: 'Send a friend request to a user',
        args: [
            {
                description: 'The username of the person to befriend',
                type: 'text',
                validator: validateCurrentRoomUser,
                autocomplete: autocompleteCurrentRoomUsers,
            }
        ],
        execute: async ([username]) => {
            console.log(`Sending friend request to: ${username}`);
            const globalState = useGlobalStore.getState();
            const userCache = globalState.users.data.userCache;
            const targetUser = Array.from(userCache.values()).find(user => user.username === username);
            if (!targetUser) {
                console.error(`User ${username} not found in cache.`);
                return;
            }

            globalState.users.actions.sendFriendRequest(targetUser.id);
        }
    })
)

export const getAllSlashCommands = () => {
    return allSlashCommands;
}

export const getPossibleSlashCommands = (prefix: string) => {
    return allSlashCommands.filter(cmd => cmd.name.startsWith(prefix) || prefix.startsWith(cmd.name));
}

export const getSlashCommandByName = (name: string) => {
    return allSlashCommands.find(cmd => cmd.name === name);
}
