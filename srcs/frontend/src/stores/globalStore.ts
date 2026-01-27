import { PublicUserDataType } from "@app/shared/api/service/db/user";
import { create } from "zustand";

interface GlobalState {
    jwt: string | null;
    onlineUsers: Set<number>;
    publicUserDataCache: Map<number, PublicUserDataType>;

    setJWT: (jwt: string | null) => void;
    addOnlineUsers: (users: number[]) => void;
    removeOnlineUsers: (users: number[]) => void;
    cachePublicUserData: (userData: PublicUserDataType | PublicUserDataType[]) => void;
}

export const useGlobalStore = create<GlobalState>((set, get) => ({
    jwt: null,
    onlineUsers: new Set<number>(),
    publicUserDataCache: new Map<number, PublicUserDataType>(),

    setJWT: (jwt: string | null) => {
        set(() => ({ jwt }));
    },

    addOnlineUsers: (users: number[]) => {
        const currentOnline = new Set(get().onlineUsers);
        users.forEach((userId) => currentOnline.add(userId));
        set(() => ({ onlineUsers: currentOnline }));
    },

    removeOnlineUsers: (users: number[]) => {
        const currentOnline = new Set(get().onlineUsers);
        users.forEach((userId) => currentOnline.delete(userId));
        set(() => ({ onlineUsers: currentOnline }));
    },

    cachePublicUserData: (userData: PublicUserDataType | PublicUserDataType[]) => {
        const cache = new Map(get().publicUserDataCache);
        if (Array.isArray(userData)) {
            userData.forEach((data) => cache.set(data.id, data));
        } else {
            cache.set(userData.id, userData);
        }
        set(() => ({ publicUserDataCache: cache }));
    },
}));