import { user_url } from "@app/shared/api/service/common/endpoints";
import { FullUserType } from "@app/shared/api/service/db/user";
import { getSocketSenderRef } from "@utils/socketRef";
import { GlobalStoreState } from "../../types";
import { fileToBase64 } from "@utils/files";
import { GlobalMeSlice } from "./types";
import { StateCreator } from "zustand";

export const createGlobalMeSlice: StateCreator<GlobalStoreState, [["zustand/immer", never]], [], GlobalMeSlice> = (set, get) => ({
    me: {
        data: {
            currentUserData: null,
            currentUserId: null,
            jwtToken: null,
        },

        actions: {
            fetchUserConnections: () => {
                getSocketSenderRef()(user_url.ws.users.fetchUserConnections, null);
            },

            updateProfileData: async (data, rawPfp) => {
                getSocketSenderRef()(user_url.ws.users.updateProfile, {
                    ...data,
                    pfp: rawPfp ? {
                        filename: rawPfp.name,
                        data: await fileToBase64(rawPfp),
                    } : undefined
                });
            }
        },

        state: {
            setCurrentUserId: (userId: number | null) => {
                set((state) => {
                    state.me.data.currentUserId = userId;
                });
            },

            setJwtToken: (token: string | null) => {
                set((state) => {
                    state.me.data.jwtToken = token;
                });
            },

            setCurrentUserData: (userData: FullUserType) => {
                set((state) => {
                    state.me.data.currentUserId = userData.id;
                    state.me.data.currentUserData = userData;
                });
            },
        },
    },
});

